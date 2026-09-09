import 'server-only'
import { prisma } from '@/server/db/client'
import { signatureHeader } from '@/lib/signature'
import { decryptSecret } from '@/lib/crypto'
import { Prisma } from '@/generated/prisma/client'
import type { OrderForwardStatus } from '@/generated/prisma/enums'
import { buildHandoffEnvelope } from './payload'
import {
  loadOrderTarget,
  recordDestinationHealth,
  type OrderTarget,
} from './destination'
import type { HandoffAck, HandoffEnvelope } from './types'

/**
 * Handing an order to the merchant's own website.
 *
 * The design in one paragraph: the order is written here first, the handoff row
 * is written with it, the first attempt happens immediately after the response
 * is flushed, and anything that fails is retried from the database. That order
 * of operations is what makes the feature safe to switch on — at no point is
 * there a sale that exists in a buyer's mind and in nobody's database.
 *
 * ── Why the row is written before the call ──────────────────────────────────
 * The obvious implementation posts the order to their site and records the
 * result. It loses orders. Any failure between the POST and the write — the
 * process being replaced mid-deploy, the database blipping, an exception in the
 * response handler — leaves an order that their system has and ours has no memory
 * of sending, or worse, one that neither has. Writing the queue row first makes
 * the handoff a fact that survives this process dying, and the row is the audit
 * trail merchants actually ask for.
 *
 * ── Why every attempt carries the same idempotency key ──────────────────────
 * The dangerous failure is not "their site said no", it is "their site said
 * nothing". A receiver that writes the order and then times out on the way back
 * looks identical to one that never got it, and the only safe response to an
 * ambiguous result is to try again — which is only safe if trying again cannot
 * create a second order. So every attempt sends `X-NCOM-Idempotency-Key`, the
 * same value every time, and the contract requires the receiver to answer a
 * repeat with the order it already has. This is the single most important line
 * in the integration.
 *
 * ── Why a 4xx is terminal and a 5xx is not ──────────────────────────────────
 * A receiver that refuses with 400 will refuse the identical bytes for ever;
 * repeating it just burns the merchant's error log. A 5xx, a timeout or a
 * connection reset is a receiver having a bad minute, and those come back. The
 * two exceptions are 408 and 429, which are 4xx in number and "later" in
 * meaning.
 */

/** Attempts per handoff, including the first. */
const MAX_ATTEMPTS = 8

/**
 * Backoff between attempts, in seconds: 15s, 1m, 5m, 15m, 1h, 3h, 6h.
 *
 * Longer at the tail than the webhook schedule, on purpose. A missed webhook is
 * a notification; a missed order is a sale nobody is packing, so the queue keeps
 * trying across a working day — long enough to survive a merchant's host being
 * down overnight and their morning being the first anyone notices.
 */
const RETRY_BACKOFF_SECONDS = [15, 60, 300, 900, 3600, 10_800, 21_600]

/** How much of a receiver's reply is kept, for debugging without storing a page. */
const RESPONSE_SNIPPET_LENGTH = 2_000

/** Rows drained per sweep, so one workspace's backlog cannot starve the rest. */
const SWEEP_BATCH = 50

export interface HandoffOutcome {
  ok: boolean
  status: OrderForwardStatus
  /** What their system called it, when it said. */
  remoteOrderNumber?: string | null
  error?: string | null
}

/**
 * Queues an order for the merchant's website, and tries it immediately.
 *
 * Called from checkout after the transaction commits. Never throws: the order
 * exists and the buyer has been told so, and there is no failure here that is
 * improved by turning it into a failed checkout. A handoff that cannot even be
 * queued is logged and shows on the order as un-sent, which is the state a
 * human can act on.
 */
export async function forwardOrder(
  organizationId: string,
  orderId: string
): Promise<void> {
  try {
    const target = await loadOrderTarget(organizationId)
    if (!target) return

    const queued = await queueForward(organizationId, orderId, target)
    if (!queued) return

    // After the response is flushed. The buyer waited for the order to be
    // written, not for someone else's server to acknowledge it — and a receiver
    // that cold-starts, which is the common case, would otherwise add seconds
    // to a page the buyer is staring at.
    await schedule(() => attemptForward(queued.id))
  } catch (cause) {
    console.error('[orders] could not queue handoff', orderId, cause)
  }
}

/**
 * Writes the queue row, or returns null if this order already has one.
 *
 * The unique index on `orderId` is what makes that check reliable: two servers
 * racing on a retried checkout both try to insert and exactly one wins, without
 * either having to hold a lock. The loser does nothing, which is correct — the
 * winner's row is already queued.
 */
async function queueForward(
  organizationId: string,
  orderId: string,
  target: OrderTarget
): Promise<{ id: string } | null> {
  const envelope = await buildHandoffEnvelope(organizationId, orderId)
  if (!envelope) {
    console.error('[orders] no order to hand off', orderId)
    return null
  }

  try {
    return await prisma.orderForward.create({
      data: {
        organizationId,
        orderId,
        endpointUrl: target.endpointUrl,
        idempotencyKey: envelope.idempotencyKey,
        payload: envelope as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    })
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === 'P2002'
    ) {
      return null
    }
    throw cause
  }
}

/**
 * One attempt at one handoff, and the bookkeeping for what it found.
 *
 * Safe to call concurrently with itself: the worst case is two attempts of the
 * same order, which the idempotency key exists to make harmless.
 */
export async function attemptForward(forwardId: string): Promise<void> {
  const forward = await prisma.orderForward.findUnique({
    where: { id: forwardId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      attempts: true,
      idempotencyKey: true,
      payload: true,
    },
  })
  if (!forward || forward.status !== 'PENDING') return

  // Read live rather than from the row: a merchant who fixed a wrong URL or
  // rotated a secret expects the queue to use what they just saved, not what
  // was true when the order arrived.
  const target = await loadOrderTarget(forward.organizationId)
  if (!target) {
    // The workspace has been switched back to NCOM, or its credentials are
    // gone. Neither is a delivery failure, and retrying either is pointless.
    await prisma.orderForward.update({
      where: { id: forward.id },
      data: {
        status: 'FAILED',
        nextAttemptAt: null,
        error:
          'Orders are no longer sent to a website, so this one was never delivered. Process it here.',
      },
    })
    return
  }

  const attempt = forward.attempts + 1
  const body = JSON.stringify(forward.payload)
  const result = await deliver(target, forward.idempotencyKey, body)

  if (result.ok) {
    await prisma.orderForward.update({
      where: { id: forward.id },
      data: {
        status: 'DELIVERED',
        attempts: attempt,
        nextAttemptAt: null,
        deliveredAt: new Date(),
        statusCode: result.statusCode,
        error: null,
        responseBody: result.snippet,
        remoteOrderId: result.ack?.orderId ?? null,
        remoteOrderNumber: result.ack?.orderNumber ?? null,
      },
    })
    await recordDestinationHealth(forward.organizationId, { ok: true })
    return
  }

  const terminal = result.terminal || attempt >= MAX_ATTEMPTS
  const backoff =
    RETRY_BACKOFF_SECONDS[
      Math.min(attempt - 1, RETRY_BACKOFF_SECONDS.length - 1)
    ]

  await prisma.orderForward.update({
    where: { id: forward.id },
    data: {
      status: terminal ? (result.terminal ? 'REFUSED' : 'FAILED') : 'PENDING',
      attempts: attempt,
      nextAttemptAt: terminal ? null : new Date(Date.now() + backoff * 1000),
      statusCode: result.statusCode,
      error: result.error,
      responseBody: result.snippet,
    },
  })
  await recordDestinationHealth(forward.organizationId, {
    ok: false,
    error: result.error,
  })
}

interface DeliveryResult {
  ok: boolean
  /** True when repeating the identical request cannot produce a better answer. */
  terminal: boolean
  statusCode: number | null
  error: string | null
  snippet: string | null
  ack: HandoffAck | null
}

/**
 * The signed POST itself.
 *
 * Signed byte-for-byte the way catalogue reads and webhooks are — same header,
 * same `${timestamp}.${body}` payload — so a merchant who already verifies one
 * of those verifies this with the function they have written.
 */
async function deliver(
  target: OrderTarget,
  idempotencyKey: string,
  body: string
): Promise<DeliveryResult> {
  const timestamp = Math.floor(Date.now() / 1000)

  let response: Response
  try {
    response = await fetch(target.endpointUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'NCOM-Orders/1',
        'X-NCOM-Key': target.keyId,
        'X-NCOM-Contract': '1',
        'X-NCOM-Timestamp': String(timestamp),
        'X-NCOM-Signature': signatureHeader(target.secret, timestamp, body),
        // Repeated in the body as `idempotencyKey`. In a header too because a
        // receiver should be able to dedupe before it parses anything, and
        // because some frameworks make the raw body awkward to reach twice.
        'X-NCOM-Idempotency-Key': idempotencyKey,
      },
      body,
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(target.timeoutMs),
    })
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : ''
    const timedOut = name === 'TimeoutError' || name === 'AbortError'
    return {
      ok: false,
      // Never terminal. A request that got no answer may well have been
      // processed, so the only safe thing to do is ask again with the same key.
      terminal: false,
      statusCode: null,
      error: timedOut
        ? `The website did not answer within ${target.timeoutMs}ms.`
        : `The website could not be reached: ${describe(cause)}`,
      snippet: null,
      ack: null,
    }
  }

  const snippet = await readSnippet(response)

  if (response.ok) {
    return {
      ok: true,
      terminal: false,
      statusCode: response.status,
      error: null,
      snippet,
      ack: readAck(snippet),
    }
  }

  // 408 and 429 are 4xx by number and "come back later" by meaning; everything
  // else in the 4xx range is a refusal that identical bytes cannot change.
  const retryable =
    response.status >= 500 || response.status === 408 || response.status === 429

  return {
    ok: false,
    terminal: !retryable,
    statusCode: response.status,
    error: explain(response.status, snippet),
    snippet,
    ack: null,
  }
}

async function readSnippet(response: Response): Promise<string | null> {
  try {
    const text = await response.text()
    return text.slice(0, RESPONSE_SNIPPET_LENGTH) || null
  } catch {
    return null
  }
}

/**
 * The receiver's own identifiers, if it sent any.
 *
 * Everything about this is optional and nothing about it can fail the delivery.
 * A receiver that answers `200 OK` with an empty body has accepted the order,
 * and a receiver that answers with HTML has too — we simply learn nothing about
 * what they called it.
 */
function readAck(snippet: string | null): HandoffAck | null {
  if (!snippet) return null
  try {
    const parsed = JSON.parse(snippet) as Record<string, unknown>
    const order = (parsed.order ?? parsed) as Record<string, unknown>
    const id = order.orderId ?? order.id
    const number = order.orderNumber ?? order.number
    return {
      orderId: typeof id === 'string' ? id : null,
      orderNumber: typeof number === 'string' ? number : null,
    }
  } catch {
    return null
  }
}

function explain(status: number, snippet: string | null): string {
  const detail = snippet?.trim().slice(0, 200)
  const suffix = detail ? ` — ${detail}` : ''

  if (status === 401 || status === 403) {
    return `The website rejected our key (${status}). Check the secret matches and that its clock is correct.${suffix}`
  }
  if (status === 404) {
    return `There is no endpoint at that address (404). Check the URL and that the handler is deployed.${suffix}`
  }
  if (status === 409) {
    return `The website refused the order as a conflict (409). If it already has this order, it must answer 200 instead.${suffix}`
  }
  if (status === 429) {
    return `The website is rate limiting us (429). It will be retried.${suffix}`
  }
  if (status >= 500) {
    return `The website answered ${status}. It will be retried.${suffix}`
  }
  return `The website refused the order with ${status}.${suffix}`
}

function describe(cause: unknown): string {
  const code = (cause as { cause?: { code?: string } })?.cause?.code
  if (code === 'ENOTFOUND') return 'the hostname does not resolve'
  if (code === 'ECONNREFUSED') return 'the connection was refused'
  if (code === 'ECONNRESET') return 'the connection was reset'
  if (code === 'CERT_HAS_EXPIRED') return 'its TLS certificate has expired'
  return cause instanceof Error ? cause.message : 'unknown error'
}

/**
 * Retries every handoff whose backoff has elapsed.
 *
 * Driven by the same cron that drains webhook deliveries. The first attempt is
 * inline, right after the order; every one after that has to come from here,
 * because the request that created the order is long gone by the time the
 * second attempt is due.
 */
export async function retryPendingForwards(): Promise<number> {
  const due = await prisma.orderForward.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: SWEEP_BATCH,
    select: { id: true },
  })

  for (const row of due) {
    await attemptForward(row.id)
  }

  return due.length
}

/**
 * Runs work once the response is on its way, or immediately outside a request.
 *
 * `after` throws when there is no request to be after — cron, scripts — rather
 * than quietly doing nothing, so the fallback is not optional.
 *
 * Imported lazily rather than at the top of the file. `next/server` drags the
 * framework's client runtime in with it, which is fine inside the app and fatal
 * in a plain-node process — and this module has to be runnable in one, because
 * that is where `pnpm check:order-handoff` proves the retry logic against a
 * real receiver. Nothing about the behaviour inside a request changes: the
 * import resolves from cache, and `after` is still called within the same
 * asynchronous context the request owns.
 */
export async function schedule(run: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import('next/server')
    after(run)
  } catch {
    void run().catch((cause) => console.error('[orders] handoff', cause))
  }
}

/**
 * Sends a sample order and reports what came back, in the merchant's language.
 *
 * Deliberately the *same* request a real order makes — same signature, same
 * headers, same envelope shape — differing only in `topic` and in a payload
 * that is obviously a sample. A test that took a shortcut would pass against a
 * receiver that still rejects real traffic, which is worse than no test at all.
 *
 * Reads the row directly rather than through `loadOrderTarget`, because the
 * whole point of pressing Test is to check an endpoint that has *not* been
 * switched on yet.
 */
export async function testOrderDestination(
  organizationId: string
): Promise<{ ok: boolean; message: string }> {
  const row = await prisma.orderDestination.findUnique({
    where: { organizationId },
    select: {
      endpointUrl: true,
      keyId: true,
      secret: true,
      timeoutMs: true,
    },
  })

  if (!row?.endpointUrl || !row.keyId || !row.secret) {
    return {
      ok: false,
      message: 'Add the address of your order endpoint first',
    }
  }

  let secret: string
  try {
    secret = decryptSecret(row.secret)
  } catch {
    return {
      ok: false,
      message:
        'The stored secret could not be read. Rotate it and update your website.',
    }
  }

  const envelope = sampleEnvelope(organizationId)
  const result = await deliver(
    {
      organizationId,
      endpointUrl: row.endpointUrl,
      keyId: row.keyId,
      secret,
      timeoutMs: row.timeoutMs,
      handoffInline: true,
    },
    envelope.idempotencyKey,
    JSON.stringify(envelope)
  )

  await recordDestinationHealth(organizationId, {
    ok: result.ok,
    error: result.error,
  })

  if (!result.ok) {
    return {
      ok: false,
      message: result.error ?? 'The website refused the test',
    }
  }

  const named = result.ack?.orderNumber ?? result.ack?.orderId
  return {
    ok: true,
    message: named
      ? `Accepted (${result.statusCode}), and answered with ${named}. Remember to delete the test order if your site filed one.`
      : `Accepted (${result.statusCode}). Orders will be handed over as they are placed.`,
  }
}

/**
 * A complete, obviously-fake order.
 *
 * Complete matters: a receiver's parser is exercised on every field it will see
 * in production, including the ones that are easy to forget — a gift line, a
 * second address line, a line from NCOM's own catalogue whose ids mean nothing
 * on their side. A test that sent two fields would pass and then production
 * would fail on the third.
 */
function sampleEnvelope(organizationId: string): HandoffEnvelope {
  const now = new Date().toISOString()

  return {
    version: 1,
    topic: 'order.test',
    idempotencyKey: `test_${Date.now().toString(36)}`,
    sentAt: now,
    organizationId,
    order: {
      id: `test_${Date.now().toString(36)}`,
      orderNumber: 'TEST-0001',
      createdAt: now,
      currencyCode: 'BDT',
      customer: {
        name: 'NCOM Test Order',
        phone: '01700000000',
        email: null,
      },
      shippingAddress: {
        name: 'NCOM Test Order',
        phone: '01700000000',
        email: null,
        address1: 'This is a test from NCOM',
        address2: 'Do not ship it',
        city: 'Dhaka',
        province: 'Dhaka',
        postalCode: '1212',
        countryCode: 'BD',
      },
      billingAddress: null,
      lines: [
        {
          productId: 'test-product',
          variantId: 'test-variant',
          source: 'website',
          title: 'Test product from your own catalogue',
          variantTitle: 'M',
          sku: 'TEST-SKU',
          vendor: null,
          imageUrl: null,
          quantity: 1,
          unitPriceCents: 100_000,
          discountCents: 0,
          taxCents: 0,
          totalCents: 100_000,
          requiresShipping: true,
          weightGrams: 500,
          isGift: false,
        },
        {
          productId: 'test-ncom-product',
          variantId: 'test-ncom-variant',
          source: 'ncom',
          title: 'Test gift stored in NCOM',
          variantTitle: null,
          sku: null,
          vendor: null,
          imageUrl: null,
          quantity: 1,
          unitPriceCents: 20_000,
          discountCents: 20_000,
          taxCents: 0,
          totalCents: 0,
          requiresShipping: true,
          weightGrams: 100,
          isGift: true,
        },
      ],
      subtotalCents: 120_000,
      discountTotalCents: 20_000,
      shippingTotalCents: 6_000,
      taxTotalCents: 0,
      totalCents: 106_000,
      discountCode: null,
      couponDiscountCents: 0,
      shippingMethodTitle: 'Inside Dhaka',
      paymentMethod: 'cash_on_delivery',
      status: 'pending',
      note: 'This is a test order sent by NCOM. Nothing was bought.',
      campaign: {
        pageId: null,
        pageTitle: 'Test campaign page',
        pageUrl: null,
        offerKey: 'test-offer',
        offerLabel: 'Buy 2, save 200',
        offerPriceCents: 100_000,
        offerRegularCents: 120_000,
      },
      store: {
        id: null,
        name: 'Test storefront',
        subdomain: null,
        url: null,
      },
    },
  }
}
