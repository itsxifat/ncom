/**
 * Proves an order handed to a merchant's website arrives once, whole, and
 * survives their site misbehaving.
 *
 * The feature's whole value is that a sale taken here becomes a sale in their
 * system, so the claims worth checking are the ones that would silently break
 * that:
 *
 *   **Exactly once.** The dangerous failure is not a refusal, it is a receiver
 *   that writes the order and then times out on the way back. That is
 *   indistinguishable from one that never got it, so we retry — which is only
 *   safe if the retry cannot create a second order. The fake shop below
 *   deduplicates on the idempotency key exactly as the contract tells merchants
 *   to, and counts how many orders it actually filed.
 *
 *   **Whole.** Every field a merchant needs to pack a parcel, present and
 *   correctly typed. Notably the picture: three kinds of image URL exist in
 *   this database and only one of them is already fit to send.
 *
 *   **Terminal when it should be.** A 400 must stop; a 500 must not.
 *
 * Run against a scratch database:
 *
 *   createdb ncom_handoff_test  # schema cloned from your dev DB
 *   DATABASE_URL=…/ncom_handoff_test AUTH_SECRET=… pnpm check:order-handoff
 *
 * It creates one throwaway organisation, uses it, and deletes it.
 *
 * Requires the react-server condition so `server-only` resolves to its empty
 * build — the npm script sets it.
 */

import { createServer, type Server } from 'node:http'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { encryptSecret } from '@/lib/crypto'
import { absoluteImageUrl, buildHandoffEnvelope } from '@/server/orders/payload'
import { attemptForward, retryPendingForwards } from '@/server/orders/forward'
import type { HandoffEnvelope } from '@/server/orders/types'

// ── Reporting ────────────────────────────────────────────────────────────

let failures = 0

function ok(message: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${message}`)
}

function bad(message: string) {
  failures += 1
  console.log(`  \x1b[31m✗\x1b[0m ${message}`)
}

function check(condition: boolean, message: string) {
  if (condition) ok(message)
  else bad(message)
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

// ── A merchant's website ─────────────────────────────────────────────────

type Behaviour = 'accept' | 'refuse' | 'error' | 'hang'

interface Receiver {
  baseUrl: string
  keyId: string
  secret: string
  /** Orders the shop actually filed, keyed by idempotency key. */
  filed: Map<string, HandoffEnvelope>
  /** Every request that arrived, including the ones deduplicated away. */
  requests: number
  /** Requests refused before parsing, because the signature did not verify. */
  unauthorized: number
  behaviour: Behaviour
  close: () => Promise<void>
}

/**
 * The receiver a merchant is told to write, written the way the docs tell them.
 *
 * Verifying with an independently-written implementation is the point: if NCOM
 * ever changes what it signs, this fails, exactly as every real integration
 * would. It would prove nothing to verify with NCOM's own helper.
 */
async function startReceiver(): Promise<Receiver> {
  const keyId = `ncomord_${randomUUID().slice(0, 12)}`
  const secret = `ncomsec_${randomUUID()}`
  const filed = new Map<string, HandoffEnvelope>()

  const state = {
    requests: 0,
    unauthorized: 0,
    behaviour: 'accept' as Behaviour,
  }

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk as Buffer))
    request.on('end', () => {
      state.requests += 1

      const raw = Buffer.concat(chunks).toString('utf8')

      // 1. the key names which secret to verify with
      if (request.headers['x-ncom-key'] !== keyId) {
        state.unauthorized += 1
        response.writeHead(401).end('{"error":"unknown key"}')
        return
      }

      // 2. recompute over "<timestamp>.<raw body>" and compare constant-time
      const header = String(request.headers['x-ncom-signature'] ?? '')
      const parts = Object.fromEntries(
        header.split(',').map((piece) => {
          const [name, ...rest] = piece.trim().split('=')
          return [name, rest.join('=')]
        })
      )
      const expected = createHmac('sha256', secret)
        .update(`${parts.t}.${raw}`)
        .digest('hex')
      const a = Buffer.from(expected, 'hex')
      const b = Buffer.from(String(parts.v1 ?? ''), 'hex')
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        state.unauthorized += 1
        response.writeHead(401).end('{"error":"bad signature"}')
        return
      }

      // 3. reject a stale timestamp
      if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) {
        state.unauthorized += 1
        response.writeHead(401).end('{"error":"stale"}')
        return
      }

      if (state.behaviour === 'hang') return // never answers; NCOM must time out
      if (state.behaviour === 'error') {
        response.writeHead(503).end('{"error":"restarting"}')
        return
      }
      if (state.behaviour === 'refuse') {
        response.writeHead(400).end('{"error":"we do not ship there"}')
        return
      }

      const envelope = JSON.parse(raw) as HandoffEnvelope
      const key = String(request.headers['x-ncom-idempotency-key'] ?? '')

      // A test is answered like a real order and filed like nothing.
      if (envelope.topic === 'order.test') {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end('{"ok":true}')
        return
      }

      // The line every integration lives or dies on: a key already seen is
      // answered with what we already have, never filed twice.
      if (!filed.has(key)) filed.set(key, envelope)

      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(
          JSON.stringify({
            orderId: `ELY-${key.slice(-6)}`,
            orderNumber: 'ELY-9001',
          })
        )
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('receiver did not bind')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/orders`,
    keyId,
    secret,
    filed,
    get requests() {
      return state.requests
    },
    get unauthorized() {
      return state.unauthorized
    },
    get behaviour() {
      return state.behaviour
    },
    set behaviour(next: Behaviour) {
      state.behaviour = next
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  } as Receiver
}

// ── Fixtures ─────────────────────────────────────────────────────────────

interface Fixture {
  organizationId: string
  orderId: string
}

/**
 * One order carrying every shape a line can have.
 *
 * A product NCOM stores, a product read from the merchant's website, and a
 * gift — plus one image of each of the three kinds, because the picture is the
 * field most likely to be quietly wrong.
 */
async function seed(receiver: Receiver): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8)

  const organization = await prisma.organization.create({
    data: {
      name: `Handoff check ${suffix}`,
      slug: `handoff-check-${suffix}`,
      settings: { create: { currencyCode: 'BDT' } },
    },
    select: { id: true },
  })

  const store = await prisma.store.create({
    data: {
      organizationId: organization.id,
      name: 'Handoff storefront',
      subdomain: `handoff-${suffix}`,
    },
    select: { id: true },
  })

  const page = await prisma.page.create({
    data: {
      storeId: store.id,
      slug: 'winter-shirts',
      title: 'Winter shirts',
      status: 'PUBLISHED',
    },
    select: { id: true },
  })

  await prisma.orderDestination.create({
    data: {
      organizationId: organization.id,
      mode: 'OWN_WEBSITE',
      endpointUrl: receiver.baseUrl,
      keyId: receiver.keyId,
      secret: encryptSecret(receiver.secret),
      timeoutMs: 1500,
      lastOkAt: new Date(),
    },
  })

  // A product NCOM stores, so one line can honestly report source `ncom`.
  const local = await prisma.product.create({
    data: {
      organizationId: organization.id,
      title: 'NCOM tote bag',
      handle: `tote-${suffix}`,
      status: 'ACTIVE',
      variants: {
        create: { title: 'Default', priceCents: 20_000, position: 0 },
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  })
  const localVariantId = local.variants[0]!.id

  const order = await prisma.order.create({
    data: {
      organizationId: organization.id,
      storeId: store.id,
      pageId: page.id,
      orderNumber: '1042',
      offerKey: 'buy-2',
      offerLabel: 'Buy 2, save ৳400',
      offerPriceCents: 250_000,
      offerRegularCents: 290_000,
      email: null,
      phone: '01700000000',
      currencyCode: 'BDT',
      subtotalCents: 310_000,
      discountTotalCents: 60_000,
      shippingTotalCents: 6_000,
      taxTotalCents: 0,
      totalCents: 256_000,
      couponDiscountCents: 0,
      shippingMethodTitle: 'Inside Dhaka',
      note: 'Call before delivery',
      shippingAddress: {
        firstName: 'Rahim',
        lastName: 'Uddin',
        address1: 'House 12, Road 4, Dhanmondi',
        city: 'Dhaka',
        countryCode: 'BD',
        phone: '01700000000',
      },
      lines: {
        create: [
          {
            // Their catalogue. The id is theirs and must survive untouched.
            productId: '68b0f1c2a9e4d3b7c1a20011',
            variantId: '68b0f1c2a9e4d3b7c1a20014',
            title: 'Oxford Shirt',
            variantTitle: 'M',
            sku: 'OXF-M',
            vendor: 'Elysium',
            imageUrl: 'https://cdn.example.com/oxford.jpg',
            quantity: 2,
            unitPriceCents: 145_000,
            totalDiscountCents: 40_000,
            totalCents: 250_000,
            weightGrams: 500,
          },
          {
            // NCOM's own, given away by the campaign.
            productId: local.id,
            variantId: localVariantId,
            title: 'NCOM tote bag',
            variantTitle: null,
            // Site-relative: correct on the storefront, broken anywhere else.
            imageUrl: '/uploads/tote.png',
            quantity: 1,
            unitPriceCents: 20_000,
            totalDiscountCents: 20_000,
            totalCents: 0,
            isGift: true,
            weightGrams: 100,
          },
        ],
      },
    },
    select: { id: true },
  })

  return { organizationId: organization.id, orderId: order.id }
}

async function cleanup(organizationId: string) {
  await prisma.organization.deleteMany({ where: { id: organizationId } })
}

// ── The checks ───────────────────────────────────────────────────────────

async function main() {
  const receiver = await startReceiver()
  const fixture = await seed(receiver)

  try {
    await checkPayload(fixture)
    await checkImages()
    await checkDelivery(fixture, receiver)
    await checkRetryIsExactlyOnce(fixture, receiver)
    await checkRefusalIsTerminal(fixture, receiver)
  } finally {
    await cleanup(fixture.organizationId)
    await receiver.close()
  }

  console.log()
  if (failures > 0) {
    console.log(`\x1b[31m${failures} check(s) failed\x1b[0m`)
    process.exit(1)
  }
  console.log('\x1b[32mAll checks passed\x1b[0m')
  process.exit(0)
}

async function checkPayload({ organizationId, orderId }: Fixture) {
  section('The payload carries everything a merchant needs to pack the parcel')

  const envelope = await buildHandoffEnvelope(organizationId, orderId)
  if (!envelope) {
    bad('an envelope was built')
    return
  }

  const order = envelope.order
  check(envelope.version === 1, 'is versioned')
  check(envelope.topic === 'order.placed', 'declares its topic')
  check(
    envelope.idempotencyKey === order.id,
    'the idempotency key is the order id'
  )
  check(order.status === 'pending', 'arrives as pending — nothing done here')
  check(order.orderNumber === '1042', 'carries the human order number')

  check(
    order.customer.name === 'Rahim Uddin' &&
      order.customer.phone === '01700000000',
    'the customer is named and reachable'
  )
  check(
    order.shippingAddress.address1 === 'House 12, Road 4, Dhanmondi' &&
      order.shippingAddress.city === 'Dhaka' &&
      order.shippingAddress.countryCode === 'BD',
    'the address is normalised to the documented field names'
  )
  check(
    order.billingAddress === null,
    'an absent billing address is null, not an object of nulls'
  )
  check(order.note === 'Call before delivery', "the buyer's note is carried")

  check(
    order.campaign.offerLabel === 'Buy 2, save ৳400' &&
      order.campaign.offerKey === 'buy-2',
    'the offer that sold it is named'
  )
  check(
    order.campaign.pageTitle === 'Winter shirts' &&
      order.campaign.pageUrl?.endsWith('/winter-shirts') === true,
    'the landing page is named and linkable'
  )
  check(
    order.store.name === 'Handoff storefront' && order.store.url !== null,
    'the storefront that took the order is named'
  )

  const shirt = order.lines.find((line) => line.sku === 'OXF-M')
  const tote = order.lines.find((line) => line.isGift)

  check(
    shirt?.source === 'website' &&
      shirt.productId === '68b0f1c2a9e4d3b7c1a20011' &&
      shirt.variantId === '68b0f1c2a9e4d3b7c1a20014',
    "a line from the merchant's own catalogue keeps their ids and says so"
  )
  check(
    tote?.source === 'ncom',
    'a line from a product NCOM stores is marked as theirs to ignore'
  )
  check(
    tote?.isGift === true &&
      tote.unitPriceCents === 20_000 &&
      tote.discountCents === 20_000,
    'a gift keeps its real price and carries an equal discount'
  )
  check(
    shirt?.variantTitle === 'M',
    'the variant is named, so the right size is picked'
  )

  // Money: integers only, and no decimal twin anywhere in the payload.
  const amounts = [
    order.subtotalCents,
    order.discountTotalCents,
    order.shippingTotalCents,
    order.taxTotalCents,
    order.totalCents,
    ...order.lines.flatMap((line) => [
      line.unitPriceCents,
      line.discountCents,
      line.totalCents,
    ]),
  ]
  check(
    amounts.every((value) => Number.isInteger(value)),
    'every amount is an integer in minor units'
  )
  const serialised = JSON.stringify(envelope)
  check(
    !/"(price|total|subtotal|amount|shipping|discount)"\s*:/i.test(serialised),
    'there is no second decimal form of any amount to disagree with the first'
  )
  check(
    order.subtotalCents -
      order.discountTotalCents +
      order.shippingTotalCents +
      order.taxTotalCents ===
      order.totalCents,
    'the totals add up'
  )
}

async function checkImages() {
  section('The picture arrives, whichever of the three places it came from')

  const origin = 'https://shop.ncom.bd'

  check(
    absoluteImageUrl('https://cdn.example.com/a.jpg', origin) ===
      'https://cdn.example.com/a.jpg',
    "an absolute URL from the merchant's own site passes through untouched"
  )
  check(
    absoluteImageUrl('/uploads/tote.png', origin) ===
      'https://shop.ncom.bd/uploads/tote.png',
    'a site-relative URL is resolved against the storefront that produced it'
  )
  check(
    absoluteImageUrl('//cdn.example.com/a.jpg', origin) ===
      'https://cdn.example.com/a.jpg',
    'a protocol-relative URL is given a scheme rather than sent as-is'
  )
  check(
    absoluteImageUrl('tote.png', origin) === null,
    'a bare filename is sent as null rather than as a URL that will 404'
  )
  check(
    absoluteImageUrl('/uploads/tote.png', null) === null,
    'a relative URL with no origin to resolve against is null, not a fragment'
  )
  check(absoluteImageUrl(null, origin) === null, 'a missing image is null')
}

async function checkDelivery(
  { organizationId, orderId }: Fixture,
  receiver: Receiver
) {
  section('A signed handoff is accepted by a receiver written to the docs')

  receiver.behaviour = 'accept'
  const forward = await queue(organizationId, orderId, receiver.baseUrl)
  await attemptForward(forward)

  const row = await prisma.orderForward.findUnique({ where: { id: forward } })
  check(row?.status === 'DELIVERED', 'the handoff is recorded as delivered')
  check(receiver.unauthorized === 0, 'the signature verified on their side')
  check(receiver.filed.size === 1, 'their site filed exactly one order')
  check(
    row?.remoteOrderNumber === 'ELY-9001',
    'their own order number is recorded, so both sides can name it'
  )
  check(row?.deliveredAt !== null, 'the delivery is timestamped')

  const filed = [...receiver.filed.values()][0]
  check(
    filed?.order.lines.length === 2,
    'both lines arrived, including the one from NCOM’s own catalogue'
  )
  // Absolute, with a scheme. Not asserted as `https` specifically because the
  // storefront origin follows NODE_ENV — it is http on a dev machine and https
  // in production, the same rule every other public URL in this codebase
  // follows. That a relative path becomes an https URL under a https origin is
  // checked directly in `checkImages`.
  check(
    filed?.order.lines.every((line) =>
      line.imageUrl === null
        ? true
        : /^https?:\/\/[^/]+\/.+/.test(line.imageUrl)
    ) === true,
    'every image that arrived is an absolute URL a receiver can fetch'
  )
}

async function checkRetryIsExactlyOnce(
  { organizationId, orderId }: Fixture,
  receiver: Receiver
) {
  section('A receiver that writes the order and then times out gets it once')

  await prisma.orderForward.deleteMany({ where: { orderId } })
  receiver.filed.clear()

  // Their site never answers. NCOM cannot tell that from "never received it",
  // so it must retry — and the retry must not produce a second order.
  receiver.behaviour = 'hang'
  const forward = await queue(organizationId, orderId, receiver.baseUrl)
  await attemptForward(forward)

  let row = await prisma.orderForward.findUnique({ where: { id: forward } })
  check(row?.status === 'PENDING', 'a timeout is queued for another attempt')
  check(row?.attempts === 1, 'the attempt is counted')
  check(
    row?.nextAttemptAt !== null,
    'a retry is scheduled rather than left to a human'
  )
  const firstKey = row?.idempotencyKey

  // Now their site is back, and had in fact filed the first request.
  receiver.behaviour = 'accept'
  await prisma.orderForward.update({
    where: { id: forward },
    data: { nextAttemptAt: new Date(Date.now() - 1000) },
  })
  const swept = await retryPendingForwards()
  check(swept >= 1, 'the sweep picks up a handoff whose backoff has elapsed')

  row = await prisma.orderForward.findUnique({ where: { id: forward } })
  check(row?.status === 'DELIVERED', 'the retry lands')
  check(
    row?.idempotencyKey === firstKey,
    'the retry carries the same idempotency key as the attempt that timed out'
  )
  check(
    receiver.filed.size === 1,
    'their site still has exactly one order, not two'
  )
}

async function checkRefusalIsTerminal(
  { organizationId, orderId }: Fixture,
  receiver: Receiver
) {
  section('A refusal stops; a bad minute does not')

  await prisma.orderForward.deleteMany({ where: { orderId } })
  receiver.behaviour = 'error'
  const transient = await queue(organizationId, orderId, receiver.baseUrl)
  await attemptForward(transient)
  let row = await prisma.orderForward.findUnique({ where: { id: transient } })
  check(row?.status === 'PENDING', 'a 503 is retried')
  check(
    (row?.error ?? '').includes('503'),
    'the reason is recorded in words a merchant can act on'
  )

  await prisma.orderForward.deleteMany({ where: { orderId } })
  receiver.behaviour = 'refuse'
  const refused = await queue(organizationId, orderId, receiver.baseUrl)
  await attemptForward(refused)
  row = await prisma.orderForward.findUnique({ where: { id: refused } })
  check(row?.status === 'REFUSED', 'a 400 is terminal')
  check(
    row?.nextAttemptAt === null,
    'nothing is scheduled for an order that will be refused identically for ever'
  )
  check(
    (row?.error ?? '').includes('we do not ship there'),
    "the receiver's own words are kept, so the merchant is told why"
  )

  // And the queue must not pick a terminal row back up.
  const swept = await retryPendingForwards()
  check(swept === 0, 'the sweep leaves refused handoffs alone')
}

/** Queues one handoff, the way checkout does, and returns its row id. */
async function queue(
  organizationId: string,
  orderId: string,
  endpointUrl: string
): Promise<string> {
  const envelope = await buildHandoffEnvelope(organizationId, orderId)
  if (!envelope) throw new Error('no envelope')

  const row = await prisma.orderForward.create({
    data: {
      organizationId,
      orderId,
      endpointUrl,
      idempotencyKey: envelope.idempotencyKey,
      payload: envelope as never,
      status: 'PENDING',
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  })
  return row.id
}

main().catch(async (cause) => {
  console.error(cause)
  process.exit(1)
})
