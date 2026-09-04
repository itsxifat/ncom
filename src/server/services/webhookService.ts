import 'server-only'
import { randomBytes } from 'node:crypto'
import { signPayload, verifySignature } from '@/lib/signature'
import { assertPublicHttpsUrl } from '@/lib/outbound-url'
import { after } from 'next/server'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import type { WebhookTopic } from '@/generated/prisma/client'

/**
 * Outbound webhooks.
 *
 * Merchants run this platform alongside a system they already have — an ERP, a
 * POS, the site they sold from last year. Those systems cannot poll for stock
 * on every page view, so the platform pushes: when a count moves or a product
 * changes here, every subscribed endpoint hears about it within seconds.
 *
 * Three properties make that safe to build on:
 *
 *   Signed. Every request carries an HMAC of its own body under a per-endpoint
 *   secret, so a receiver can prove the call came from us. Without it, anyone
 *   who learns the URL can zero out a merchant's stock, and the URL is not a
 *   secret — it sits in logs, proxies and browser history.
 *
 *   At-least-once, with a stable event id. Delivery is retried on failure, so a
 *   receiver will occasionally see the same event twice; `id` is identical
 *   across retries and across endpoints so they can discard the duplicate. The
 *   alternative — at-most-once — silently loses stock updates whenever a
 *   receiver restarts, which is the failure merchants actually hit.
 *
 *   Logged before sending. The WebhookDelivery row is written first and is both
 *   the queue and the audit trail. A delivery that was never recorded cannot be
 *   retried and cannot be explained, and "did you actually send it?" is the
 *   first question in every integration support thread.
 */

export const WEBHOOK_TOPICS: {
  topic: WebhookTopic
  /** The `topic` string on the wire. Lowercase dotted, like every other API. */
  wire: string
  description: string
}[] = [
  // The catalogue topics fire for the products NCOM *stores* — the ones a
  // merchant adds here for what their own shop does not carry.
  //
  // They deliberately never fire for a product read from a connected website. A
  // change there is announced by that site to whatever it already tells, and
  // relaying it back would mean either polling their catalogue or pretending to
  // know something we only find out when a shopper happens to load a page.
  {
    topic: 'PRODUCT_CREATED',
    wire: 'product.created',
    description: 'A product was added to the catalogue NCOM stores.',
  },
  {
    topic: 'PRODUCT_UPDATED',
    wire: 'product.updated',
    description:
      'A product NCOM stores changed — title, description, price, options, images, status or category.',
  },
  {
    topic: 'PRODUCT_DELETED',
    wire: 'product.deleted',
    description:
      'A product NCOM stores was deleted. Archiving sends product.updated.',
  },
  {
    topic: 'INVENTORY_UPDATED',
    wire: 'inventory.updated',
    description:
      'The sellable stock of a variant NCOM stores changed, from a sale, a return or a manual adjustment. Stock on your own website is yours and is never reported back to you.',
  },
  {
    topic: 'CATEGORY_CREATED',
    wire: 'category.created',
    description: 'A category, subcategory or child category was created here.',
  },
  {
    topic: 'CATEGORY_UPDATED',
    wire: 'category.updated',
    description:
      'A category here was renamed, moved, reordered or deactivated.',
  },
  {
    topic: 'CATEGORY_DELETED',
    wire: 'category.deleted',
    description: 'A category here was deleted.',
  },
  {
    topic: 'ORDER_CREATED',
    wire: 'order.created',
    description:
      'An order was placed. Sent after stock has moved — decremented here for products NCOM stores, and requested from your site for the rest — so the quantities in it are already committed.',
  },
  {
    topic: 'ORDER_UPDATED',
    wire: 'order.updated',
    description: 'An order changed status, or was paid or refunded.',
  },
  {
    topic: 'ORDER_CANCELLED',
    wire: 'order.cancelled',
    description:
      'An order was cancelled. Its units were released back to your own stock first.',
  },
  {
    topic: 'ORDER_FULFILLED',
    wire: 'order.fulfilled',
    description: 'An order, or part of one, shipped.',
  },
  {
    topic: 'ORDER_HELD_FOR_REVIEW',
    wire: 'order.held_for_review',
    description:
      'An order failed the courier fraud screen and is waiting on a human decision.',
  },
  {
    topic: 'SHIPMENT_CREATED',
    wire: 'shipment.created',
    description: 'A consignment was created at a courier for an order.',
  },
  {
    topic: 'SHIPMENT_UPDATED',
    wire: 'shipment.updated',
    description:
      'A parcel moved — picked up, in transit, out for delivery, on hold.',
  },
  {
    topic: 'SHIPMENT_DELIVERED',
    wire: 'shipment.delivered',
    description:
      'A parcel reached the customer. Cash-on-delivery amounts are settled onto the order at this point.',
  },
  {
    topic: 'SHIPMENT_RETURNED',
    wire: 'shipment.returned',
    description:
      'A parcel came back. Its units were released back to your own stock first.',
  },
]

const WIRE_BY_TOPIC = new Map(
  WEBHOOK_TOPICS.map((entry) => [entry.topic, entry.wire])
)

/** The dotted string a receiver reads out of the payload's `topic` field. */
export function topicWireName(topic: WebhookTopic): string {
  return WIRE_BY_TOPIC.get(topic) ?? topic.toLowerCase()
}

/**
 * How long to wait for a receiver. Long enough for a slow-but-working endpoint
 * on another continent, short enough that a hung one does not pin a connection
 * for a minute while the rest of the queue waits behind it.
 */
const REQUEST_TIMEOUT_MS = 10_000

/** Attempts per delivery, including the first. */
const MAX_ATTEMPTS = 6

/**
 * Backoff between attempts, in seconds: ~10s, 1m, 5m, 30m, 2h.
 *
 * Front-loaded because most failures are a receiver restarting and are over in
 * seconds; the long tail exists so a genuinely broken endpoint is not retried
 * into the ground, and so a deploy that takes an hour still catches up.
 */
const RETRY_BACKOFF_SECONDS = [10, 60, 300, 1800, 7200]

/**
 * Consecutive failures before an endpoint is parked.
 *
 * An endpoint that has failed this many times in a row is not having a bad
 * minute, it is gone — and every further event queued against it is storage
 * spent on a delivery nobody will read.
 */
const FAILURE_LIMIT = 20

/** Response body kept per attempt, for debugging without storing a whole page. */
const RESPONSE_SNIPPET_LENGTH = 2_000

export interface WebhookEventEnvelope {
  id: string
  topic: string
  createdAt: string
  organizationId: string
  data: unknown
}

/**
 * Queues an event for every endpoint subscribed to it.
 *
 * Callers do not await the HTTP calls — this returns as soon as the delivery
 * rows are written, and the sending happens after the response is flushed. A
 * merchant pressing Save must not wait on someone else's server, and a
 * receiver that is down must not fail the save that triggered it.
 *
 * Never throws. A webhook is a notification about work that already succeeded;
 * turning a delivery problem into a failed product save would be strictly
 * worse than the missed notification.
 */
export async function emitWebhook(
  organizationId: string,
  topic: WebhookTopic,
  data: unknown
): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        isActive: true,
        topics: { has: topic },
      },
      select: { id: true },
    })
    if (endpoints.length === 0) return

    // One id for the business event, reused by every endpoint and every retry,
    // so a receiver subscribed twice can tell it is the same thing happening
    // once.
    const eventId = `evt_${randomBytes(16).toString('hex')}`

    await prisma.webhookDelivery.createMany({
      data: endpoints.map((endpoint) => ({
        webhookId: endpoint.id,
        topic,
        eventId,
        payload: toJson(data),
        status: 'PENDING' as const,
        nextAttemptAt: new Date(),
      })),
    })

    const pending = await prisma.webhookDelivery.findMany({
      where: { eventId },
      select: { id: true },
    })

    scheduleDispatch(pending.map((delivery) => delivery.id))
  } catch (cause) {
    console.error('[webhooks] failed to queue', topic, cause)
  }
}

/**
 * Hands the sending to `after()` so it runs once the response is on its way.
 *
 * Falls back to a floating promise outside a request — seed scripts and the
 * retry cron have no response to wait for, and `after` throws there rather than
 * quietly doing nothing.
 */
function scheduleDispatch(deliveryIds: string[]) {
  if (deliveryIds.length === 0) return

  const run = async () => {
    for (const id of deliveryIds) {
      await dispatchDelivery(id)
    }
  }

  try {
    after(run)
  } catch {
    void run().catch((cause) => console.error('[webhooks] dispatch', cause))
  }
}

/**
 * Sends one delivery and records what happened.
 *
 * Records the attempt whatever the outcome, including transport-level failures
 * where there is no status code at all — a DNS error is the most common real
 * cause and the least visible one.
 */
export async function dispatchDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  })
  if (!delivery || delivery.status === 'SUCCEEDED') return
  if (!delivery.webhook.isActive) return

  const attempt = delivery.attempts + 1
  const body = JSON.stringify({
    id: delivery.eventId,
    topic: topicWireName(delivery.topic),
    createdAt: delivery.createdAt.toISOString(),
    organizationId: delivery.webhook.organizationId,
    data: delivery.payload,
  } satisfies WebhookEventEnvelope)

  let secret: string
  try {
    secret = decryptSecret(delivery.webhook.secret)
  } catch (cause) {
    console.error('[webhooks] cannot decrypt endpoint secret', cause)
    await recordFailure(
      delivery.id,
      delivery.webhookId,
      attempt,
      null,
      'Endpoint secret could not be decrypted',
      null
    )
    return
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signPayload(secret, timestamp, body)

  try {
    const response = await fetch(delivery.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NCOM-Webhooks/1',
        'X-NCOM-Topic': topicWireName(delivery.topic),
        'X-NCOM-Event-Id': delivery.eventId,
        'X-NCOM-Delivery-Id': delivery.id,
        'X-NCOM-Attempt': String(attempt),
        'X-NCOM-Timestamp': String(timestamp),
        'X-NCOM-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // A webhook posts to an address the merchant typed. Following redirects
      // would let a benign-looking URL bounce the signed request somewhere
      // else entirely, so a redirect is reported as the misconfiguration it is.
      redirect: 'manual',
      cache: 'no-store',
    })

    const snippet = await readSnippet(response)

    if (response.ok) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCEEDED',
            attempts: attempt,
            statusCode: response.status,
            responseBody: snippet,
            error: null,
            nextAttemptAt: null,
            completedAt: new Date(),
          },
        }),
        prisma.webhookEndpoint.update({
          where: { id: delivery.webhookId },
          data: {
            consecutiveFailures: 0,
            lastSuccessAt: new Date(),
            lastErrorMessage: null,
          },
        }),
      ])
      return
    }

    await recordFailure(
      delivery.id,
      delivery.webhookId,
      attempt,
      response.status,
      `Endpoint responded ${response.status}`,
      snippet
    )
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.name === 'TimeoutError'
          ? `No response within ${REQUEST_TIMEOUT_MS / 1000}s`
          : cause.message
        : 'Request failed'

    await recordFailure(
      delivery.id,
      delivery.webhookId,
      attempt,
      null,
      message,
      null
    )
  }
}

async function recordFailure(
  deliveryId: string,
  webhookId: string,
  attempt: number,
  statusCode: number | null,
  message: string,
  responseBody: string | null
) {
  const exhausted = attempt >= MAX_ATTEMPTS
  const backoff =
    RETRY_BACKOFF_SECONDS[attempt - 1] ??
    RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1]!

  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: webhookId },
    data: {
      consecutiveFailures: { increment: 1 },
      lastFailureAt: new Date(),
      lastErrorMessage: message.slice(0, 500),
    },
    select: { consecutiveFailures: true },
  })

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      attempts: attempt,
      statusCode,
      error: message.slice(0, 500),
      responseBody,
      nextAttemptAt: exhausted ? null : new Date(Date.now() + backoff * 1_000),
      completedAt: exhausted ? new Date() : null,
    },
  })

  if (endpoint.consecutiveFailures >= FAILURE_LIMIT) {
    await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: { isActive: false, disabledAt: new Date() },
    })
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
 * The signature a receiver must reproduce, and the verification they perform.
 *
 * Both live in lib/signature now — the catalogue connector signs its requests
 * with the identical scheme, and a merchant who wrote a webhook verifier can
 * reuse it there unchanged. Re-exported here so existing callers and the docs
 * page keep one import.
 */
export { signPayload, verifySignature }

/**
 * Retries deliveries whose backoff has elapsed. Driven by the cron route.
 *
 * Bounded per run so one broken endpoint with thousands of queued events cannot
 * consume the whole invocation and starve everyone else's retries.
 */
export async function retryPendingDeliveries(limit = 100): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: 'PENDING',
      attempts: { gt: 0 },
      nextAttemptAt: { lte: new Date() },
      webhook: { isActive: true },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  for (const delivery of due) {
    await dispatchDelivery(delivery.id)
  }

  return due.length
}

// ── Endpoint management ──────────────────────────────────────────────────

export async function listWebhookEndpoints(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  })

  const counts = await prisma.webhookDelivery.groupBy({
    by: ['webhookId', 'status'],
    where: { webhookId: { in: endpoints.map((endpoint) => endpoint.id) } },
    _count: { _all: true },
  })

  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    topics: endpoint.topics,
    isActive: endpoint.isActive,
    consecutiveFailures: endpoint.consecutiveFailures,
    disabledAt: endpoint.disabledAt,
    lastSuccessAt: endpoint.lastSuccessAt,
    lastFailureAt: endpoint.lastFailureAt,
    lastErrorMessage: endpoint.lastErrorMessage,
    createdAt: endpoint.createdAt,
    succeeded: countFor(counts, endpoint.id, 'SUCCEEDED'),
    failed: countFor(counts, endpoint.id, 'FAILED'),
    pending: countFor(counts, endpoint.id, 'PENDING'),
  }))
}

function countFor(
  counts: { webhookId: string; status: string; _count: { _all: number } }[],
  webhookId: string,
  status: string
) {
  return (
    counts.find(
      (entry) => entry.webhookId === webhookId && entry.status === status
    )?._count._all ?? 0
  )
}

export interface WebhookEndpointInput {
  url: string
  description?: string | null
  topics: WebhookTopic[]
  isActive?: boolean
}

/**
 * Creates an endpoint and returns its signing secret in the clear, once.
 *
 * The secret is stored encrypted rather than hashed — unlike an API key it has
 * to be used on every send — but it is still only *shown* at creation, so it
 * does not end up screenshotted into a support ticket months later.
 */
export async function createWebhookEndpoint(
  organizationId: string,
  input: WebhookEndpointInput
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const url = assertDeliverableUrl(input.url)
  if (input.topics.length === 0) {
    throw new Error('Choose at least one event to send')
  }

  const secret = `whsec_${randomBytes(24).toString('base64url')}`

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      organizationId,
      url,
      description: input.description?.trim() || null,
      topics: input.topics,
      secret: encryptSecret(secret),
      isActive: input.isActive ?? true,
    },
    select: { id: true, url: true, topics: true },
  })

  return { endpoint, secret }
}

export async function updateWebhookEndpoint(
  organizationId: string,
  webhookId: string,
  input: Partial<WebhookEndpointInput>
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: webhookId, organizationId },
    select: { id: true },
  })
  if (!existing) throw new Error('Endpoint not found')

  if (input.topics && input.topics.length === 0) {
    throw new Error('Choose at least one event to send')
  }

  return prisma.webhookEndpoint.update({
    where: { id: webhookId },
    data: {
      url: input.url ? assertDeliverableUrl(input.url) : undefined,
      description:
        input.description === undefined
          ? undefined
          : input.description?.trim() || null,
      topics: input.topics,
      isActive: input.isActive,
      // Re-enabling by hand is an explicit statement that the endpoint is fixed,
      // so it starts from a clean slate rather than one failure from parking.
      ...(input.isActive === true
        ? { consecutiveFailures: 0, disabledAt: null }
        : {}),
    },
    select: { id: true },
  })
}

export async function deleteWebhookEndpoint(
  organizationId: string,
  webhookId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: webhookId, organizationId },
    select: { id: true },
  })
  if (!existing) throw new Error('Endpoint not found')

  await prisma.webhookEndpoint.delete({ where: { id: webhookId } })
}

/**
 * Rotates an endpoint's signing secret and returns the new one once.
 *
 * The old secret stops working immediately. That is a deliberate cut rather
 * than an overlap window: a receiver that is still verifying with the old key
 * should fail loudly on the next event, not keep working for a day and then
 * break at an unrelated moment.
 */
export async function rotateWebhookSecret(
  organizationId: string,
  webhookId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: webhookId, organizationId },
    select: { id: true },
  })
  if (!existing) throw new Error('Endpoint not found')

  const secret = `whsec_${randomBytes(24).toString('base64url')}`
  await prisma.webhookEndpoint.update({
    where: { id: webhookId },
    data: { secret: encryptSecret(secret) },
  })

  return secret
}

/**
 * Sends a synthetic event so the merchant can confirm the endpoint works
 * before a real order depends on it.
 *
 * Awaited rather than queued, because the whole point is to show the result.
 */
export async function sendTestEvent(
  organizationId: string,
  webhookId: string,
  topic: WebhookTopic = 'PRODUCT_UPDATED'
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: webhookId, organizationId },
    select: { id: true },
  })
  if (!endpoint) throw new Error('Endpoint not found')

  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId,
      topic,
      eventId: `evt_test_${randomBytes(8).toString('hex')}`,
      payload: {
        test: true,
        message:
          'Test event from NCOM. The shape matches a real ' +
          topicWireName(topic) +
          ' event.',
      },
      status: 'PENDING',
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  })

  await dispatchDelivery(delivery.id)

  return prisma.webhookDelivery.findUniqueOrThrow({
    where: { id: delivery.id },
    select: { status: true, statusCode: true, error: true },
  })
}

export async function listWebhookDeliveries(
  organizationId: string,
  options: { webhookId?: string; take?: number } = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.webhookDelivery.findMany({
    where: {
      webhook: {
        organizationId,
        ...(options.webhookId ? { id: options.webhookId } : {}),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(options.take ?? 50, 200),
    select: {
      id: true,
      topic: true,
      eventId: true,
      status: true,
      attempts: true,
      statusCode: true,
      error: true,
      createdAt: true,
      completedAt: true,
      nextAttemptAt: true,
      webhook: { select: { id: true, url: true } },
    },
  })
}

/** Queues a delivery for one more immediate attempt, from the deliveries table. */
export async function redeliverWebhook(
  organizationId: string,
  deliveryId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, webhook: { organizationId } },
    select: { id: true },
  })
  if (!delivery) throw new Error('Delivery not found')

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0 },
  })

  await dispatchDelivery(deliveryId)
}

/**
 * Rejects URLs we should not be making signed POSTs to.
 *
 * A webhook URL is attacker-controlled input in the SSRF sense: the merchant
 * types it, and the platform's own network is what dials it. Blocking loopback,
 * link-local and private ranges keeps a merchant from pointing an endpoint at
 * internal infrastructure and using our egress to reach it.
 *
 * This is a literal-address check, not a DNS resolution — a hostname that
 * resolves to a private address still passes here. The real backstop for that
 * is egress policy at the network layer; this stops the easy cases and the
 * accidents, and http is refused outright in production so a signed payload is
 * never sent in the clear.
 */
export function assertDeliverableUrl(raw: string): string {
  return assertPublicHttpsUrl(raw, 'Webhook URLs')
}

/** Prisma's Json column rejects `undefined`; a round-trip normalises it away. */
function toJson(data: unknown) {
  return JSON.parse(JSON.stringify(data ?? {}))
}
