/**
 * Proves one shirt cannot be sold twice.
 *
 * The claim this checks is narrow and specific: when several checkouts race for
 * the last unit of a product that lives on a *merchant's own website*, exactly
 * one of them gets it. NCOM's own products have never had this problem — a
 * conditional decrement inside the checkout transaction settles it — but stock
 * read over HTTP has no such statement available, and the obvious
 * implementation (read the number, decide, write the order) lets every
 * concurrent checkout read the same "1 available" and all of them succeed.
 *
 * Two shapes of merchant site are exercised, because they fail differently:
 *
 *   **No `/reserve`.** The realistic case, and the dangerous one. Their figure
 *   does not move when NCOM sells — their system finds out when it processes
 *   the order webhook, minutes later. The fake shop below models that exactly:
 *   it keeps answering "1 available" no matter how much has been sold. Nothing
 *   but NCOM's own bookkeeping can stop the second sale here.
 *
 *   **With `/reserve`.** Their site decrements when asked, so their figure is
 *   authoritative — but only if the read and the reserve are not interleaved
 *   with someone else's.
 *
 * Run against a scratch database:
 *
 *   createdb ncom_queue_test  # schema cloned from your dev DB, migrations applied
 *   DATABASE_URL=…/ncom_queue_test AUTH_SECRET=… pnpm check:stock-queue
 *
 * It creates one throwaway organisation, uses it, and deletes it.
 *
 * Requires the react-server condition so `server-only` resolves to its empty
 * build — the npm script sets it.
 */

import { createServer, type Server } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { takeRemoteStock } from '@/server/catalog/source'
import {
  outstandingHolds,
  releaseStockHolds,
  withStockLock,
} from '@/server/catalog/queue'
import { encryptSecret } from '@/lib/crypto'

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

interface ShopOptions {
  /** Units the shop believes it has, per variant. */
  stock: Record<string, number>
  /**
   * Whether `/reserve` is implemented. False models the common case: the
   * number never moves at checkout time, only when their own system later
   * catches up.
   */
  reserve: boolean
  /** Milliseconds the shop takes to answer, to widen the race window. */
  latencyMs?: number
}

interface Shop {
  server: Server
  baseUrl: string
  secret: string
  keyId: string
  /** How many units `/reserve` actually granted. */
  granted: () => number
  stockOf: (variantId: string) => number
}

function startShop(options: ShopOptions): Promise<Shop> {
  const secret = `ncomsec_${randomUUID().replace(/-/g, '')}`
  const keyId = `ncomcat_${randomUUID().slice(0, 8)}`
  const stock = { ...options.stock }
  let granted = 0

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')

    // Verify exactly as docs/product-source.md tells a merchant to. A test that
    // skipped this would pass with a signature no real connector would accept.
    const header = request.headers['x-ncom-signature']
    if (typeof header !== 'string') {
      response.writeHead(401).end('{"error":"unsigned"}')
      return
    }
    const timestamp = /t=(\d+)/.exec(header)?.[1] ?? ''
    const given = /v1=([a-f0-9]+)/.exec(header)?.[1] ?? ''
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`)
      .digest('hex')
    if (given !== expected) {
      response.writeHead(401).end('{"error":"bad signature"}')
      return
    }

    if (options.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, options.latencyMs))
    }

    const path = (request.url ?? '').split('?')[0]
    const body = raw ? JSON.parse(raw) : {}

    const send = (payload: unknown) => {
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(payload))
    }

    if (path.endsWith('/ping')) {
      send({
        contract: '1',
        platform: 'fake/1.0',
        currency: 'BDT',
        capabilities: {
          products: true,
          stock: true,
          search: false,
          categories: false,
          reserve: options.reserve,
          release: options.reserve,
        },
      })
      return
    }

    if (path.endsWith('/stock')) {
      send({
        stock: (body.ids as string[]).map((id) => ({
          variant_id: id,
          // The whole point: on a site with no reserve endpoint this number
          // does not come down when NCOM sells. It is what their own database
          // says, and their database has not been told yet.
          available: stock[id] ?? 0,
          policy: 'deny',
        })),
      })
      return
    }

    if (path.endsWith('/reserve')) {
      const lines = body.lines as { variantId: string; quantity: number }[]
      const rejected = lines.filter(
        (line) => (stock[line.variantId] ?? 0) < line.quantity
      )

      if (rejected.length > 0) {
        send({
          ok: false,
          rejected: rejected.map((line) => ({
            variant_id: line.variantId,
            reason: `Only ${stock[line.variantId] ?? 0} left`,
          })),
        })
        return
      }

      for (const line of lines) {
        stock[line.variantId] -= line.quantity
        granted += line.quantity
      }
      send({ ok: true })
      return
    }

    if (path.endsWith('/release')) {
      for (const line of body.lines as {
        variantId: string
        quantity: number
      }[]) {
        stock[line.variantId] = (stock[line.variantId] ?? 0) + line.quantity
        granted -= line.quantity
      }
      send({ ok: true })
      return
    }

    response.writeHead(404).end('{"error":"not found"}')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        secret,
        keyId,
        granted: () => granted,
        stockOf: (variantId) => stock[variantId] ?? 0,
      })
    })
  })
}

// ── Workspace fixture ────────────────────────────────────────────────────

async function createWorkspace(shop: Shop): Promise<string> {
  const suffix = randomUUID().slice(0, 8)

  const organization = await prisma.organization.create({
    data: {
      name: `Stock queue check ${suffix}`,
      slug: `stock-queue-check-${suffix}`,
    },
    select: { id: true },
  })

  await prisma.catalogConnection.create({
    data: {
      organizationId: organization.id,
      baseUrl: shop.baseUrl,
      keyId: shop.keyId,
      secret: encryptSecret(shop.secret),
      timeoutMs: 5000,
      contractVersion: '1',
      platform: 'fake/1.0',
      currencyCode: 'BDT',
      // Overwritten per scenario by setCapabilities below: capabilities are
      // read from this row rather than re-fetched from /ping on every call.
      capabilities: {
        products: true,
        stock: true,
        search: false,
        categories: false,
        reserve: false,
        release: false,
      },
    },
  })

  return organization.id
}

/** Writes the capabilities the scenario is actually testing. */
async function setCapabilities(organizationId: string, reserve: boolean) {
  await prisma.catalogConnection.update({
    where: { organizationId },
    data: {
      capabilities: {
        products: true,
        stock: true,
        search: false,
        categories: false,
        reserve,
        release: reserve,
      },
    },
  })
}

async function destroyWorkspace(organizationId: string) {
  await prisma.organization.delete({ where: { id: organizationId } })
}

/**
 * Runs `count` takes at the same moment and reports how many were allowed.
 *
 * Each gets its own `orderRef`, because each is a different shopper's cart —
 * two attempts sharing one would be a retry, which is a case the hold ledger
 * deliberately treats as one claim rather than two.
 */
async function race(
  organizationId: string,
  variantId: string,
  count: number
): Promise<{ allowed: number; refused: string[] }> {
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_unused, index) =>
      takeRemoteStock(organizationId, `cart-${randomUUID()}-${index}`, [
        { variantId, quantity: 1 },
      ])
    )
  )

  return {
    allowed: results.filter((result) => result.status === 'fulfilled').length,
    refused: results
      .filter((result) => result.status === 'rejected')
      .map((result) =>
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      ),
  }
}

// ── Scenarios ────────────────────────────────────────────────────────────

async function main() {
  console.log('\x1b[1mStock queue — can one shirt be sold twice?\x1b[0m')

  // A site that never decrements. The realistic, dangerous shape.
  {
    section('Merchant site with no /reserve — 6 shoppers, 1 shirt')

    const shop = await startShop({
      stock: { 'shirt-l': 1 },
      reserve: false,
      latencyMs: 25,
    })
    const organizationId = await createWorkspace(shop)
    await setCapabilities(organizationId, false)

    try {
      const { allowed, refused } = await race(organizationId, 'shirt-l', 6)

      check(
        allowed === 1,
        `exactly one checkout was allowed (got ${allowed})` +
          (allowed > 1
            ? ' — the shop would have taken money for stock it does not have'
            : '')
      )
      check(
        refused.length === 5,
        `the other five were refused (got ${refused.length})`
      )
      check(
        refused.every((message) => /sold out|Only \d+ left/.test(message)),
        'each refusal says why in a sentence a shopper can act on'
      )
      check(
        shop.stockOf('shirt-l') === 1,
        "the merchant's own figure is untouched, as their system has not heard yet"
      )

      const held = await outstandingHolds(organizationId, ['shirt-l'])
      check(
        held.get('shirt-l') === 1,
        `NCOM is holding the one unit it sold (holding ${held.get('shirt-l') ?? 0})`
      )

      // A seventh shopper arriving later must still be refused — the hold, not
      // the lock, is what stops them, since nothing is racing any more.
      const later = await race(organizationId, 'shirt-l', 1)
      check(
        later.allowed === 0,
        'a shopper arriving a minute later is still refused, from the hold alone'
      )
    } finally {
      await destroyWorkspace(organizationId)
      shop.server.close()
    }
  }

  // A site that does decrement. Their number is authoritative — as long as the
  // read and the reserve are not interleaved.
  {
    section('Merchant site with /reserve — 6 shoppers, 1 shirt')

    const shop = await startShop({
      stock: { 'shirt-m': 1 },
      reserve: true,
      latencyMs: 25,
    })
    const organizationId = await createWorkspace(shop)
    await setCapabilities(organizationId, true)

    try {
      const { allowed } = await race(organizationId, 'shirt-m', 6)

      check(allowed === 1, `exactly one checkout was allowed (got ${allowed})`)
      check(
        shop.granted() === 1,
        `the shop granted one unit (granted ${shop.granted()})`
      )
      check(
        shop.stockOf('shirt-m') === 0,
        "the merchant's own figure came down, because they were asked"
      )

      const held = await outstandingHolds(organizationId, ['shirt-m'])
      check(
        (held.get('shirt-m') ?? 0) === 0,
        'nothing is subtracted twice — their count already excludes it'
      )
    } finally {
      await destroyWorkspace(organizationId)
      shop.server.close()
    }
  }

  // Stock that comes back.
  {
    section('Cancelling gives the unit back')

    const shop = await startShop({ stock: { cap: 1 }, reserve: false })
    const organizationId = await createWorkspace(shop)
    await setCapabilities(organizationId, false)

    try {
      await takeRemoteStock(organizationId, 'cart-a', [
        { variantId: 'cap', quantity: 1 },
      ])

      let refusedSecond = false
      await takeRemoteStock(organizationId, 'cart-b', [
        { variantId: 'cap', quantity: 1 },
      ]).catch(() => {
        refusedSecond = true
      })
      check(refusedSecond, 'a second shopper is refused while the hold stands')

      await releaseStockHolds(organizationId, 'cart-a')

      const afterRelease = await takeRemoteStock(organizationId, 'cart-c', [
        { variantId: 'cap', quantity: 1 },
      ])
      check(
        afterRelease === true,
        'once the first order is cancelled the unit is sellable again'
      )
    } finally {
      await destroyWorkspace(organizationId)
      shop.server.close()
    }
  }

  // Partial returns must not release the whole claim.
  {
    section('Returning one of three units keeps the other two held')

    const shop = await startShop({ stock: { mug: 3 }, reserve: false })
    const organizationId = await createWorkspace(shop)
    await setCapabilities(organizationId, false)

    try {
      await takeRemoteStock(organizationId, 'cart-d', [
        { variantId: 'mug', quantity: 3 },
      ])
      const gaveBack = await releaseStockHolds(organizationId, 'cart-d', [
        { variantId: 'mug', quantity: 1 },
      ])

      const held = await outstandingHolds(organizationId, ['mug'])
      check(
        held.get('mug') === 2,
        `two units stay held (holding ${held.get('mug') ?? 0})`
      )
      check(
        gaveBack.get('mug') === 1,
        `it reports giving back exactly one (reported ${gaveBack.get('mug') ?? 0})`
      )

      // The compound case: an order edit claims more units under its own
      // reference, and a partial return walks both. Asking each reference for
      // the whole quantity would give back four units for a return of one.
      await takeRemoteStock(organizationId, 'order-d', [
        { variantId: 'mug', quantity: 1 },
      ])

      const capped = await releaseStockHolds(organizationId, 'order-d', [
        { variantId: 'mug', quantity: 3 },
      ])
      check(
        capped.get('mug') === 1,
        `a reference only gives up what it took (reported ${capped.get('mug') ?? 0} of 3 asked)`
      )
      check(
        (await outstandingHolds(organizationId, ['mug'])).get('mug') === 2,
        'the other reference still holds its two'
      )
    } finally {
      await destroyWorkspace(organizationId)
      shop.server.close()
    }
  }

  // The lock itself: a crashed holder must not block a variant forever.
  {
    section('A lease that is never released expires on its own')

    const shop = await startShop({ stock: {}, reserve: false })
    const organizationId = await createWorkspace(shop)

    try {
      const order: string[] = []

      // A holder that overruns its 200ms lease, and a rival that waits it out.
      const slow = withStockLock(
        organizationId,
        ['v'],
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 600))
          order.push('slow')
        },
        { leaseMs: 200, waitMs: 3000 }
      )

      await new Promise((resolve) => setTimeout(resolve, 50))

      const rival = withStockLock(
        organizationId,
        ['v'],
        async () => {
          order.push('rival')
        },
        { leaseMs: 200, waitMs: 3000 }
      )

      await Promise.all([slow, rival])
      check(
        order[0] === 'rival',
        'the rival took over the expired lease rather than waiting forever'
      )

      // And a lease held normally is respected.
      const seen: string[] = []
      await Promise.all([
        withStockLock(organizationId, ['w'], async () => {
          seen.push('first-in')
          await new Promise((resolve) => setTimeout(resolve, 150))
          seen.push('first-out')
        }),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          await withStockLock(organizationId, ['w'], async () => {
            seen.push('second-in')
          })
        })(),
      ])
      check(
        seen.join(',') === 'first-in,first-out,second-in',
        `the second waited for the first to finish (${seen.join(',')})`
      )
    } finally {
      await destroyWorkspace(organizationId)
      shop.server.close()
    }
  }

  console.log(
    failures === 0
      ? '\n\x1b[32mPassed\x1b[0m — the last unit can only be sold once.\n'
      : `\n\x1b[31m${failures} failed\x1b[0m\n`
  )

  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
