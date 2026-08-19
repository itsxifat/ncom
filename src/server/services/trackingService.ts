import 'server-only'
import { after } from 'next/server'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { decryptSecret } from '@/lib/crypto'
import { splitName } from '@/lib/tracking/hash'
import {
  CLIENT_ID_HEADER,
  FBC_HEADER,
  FBP_HEADER,
} from '@/lib/tracking/request-attribution'
import {
  FALLBACK_CLIENT_ID_COOKIE,
  FBC_COOKIE,
  FBP_COOKIE,
  GA_COOKIE,
  gaSessionCookieName,
  mintClientId,
  parseGaClientId,
  parseGaSessionId,
} from '@/lib/tracking/identity'
import type {
  DeliveryOutcome,
  TrackedEvent,
  TrackedItem,
  TrackingConfig,
  TrackingIdentity,
} from '@/lib/tracking/types'
import {
  buildMetaEvent,
  isRetryableMetaStatus,
  sendMetaEvent,
} from './tracking/metaCapi'
import {
  buildGa4Payload,
  isRetryableGa4Status,
  sendGa4Event,
} from './tracking/ga4'
import type {
  TrackingDestination,
  TrackingEventName,
} from '@/generated/prisma/client'

/**
 * Server-side conversion tracking.
 *
 * A storefront that reports its sales only from the browser reports a fraction
 * of them. Ad blockers, tracking protection, a tab closed on the thank-you
 * screen, a phone that dropped off the network mid-request — each is a sale the
 * merchant made and Meta never heard about, and an ad platform that cannot see
 * a conversion cannot optimise towards it. This module reports the same events
 * from here, where nothing the buyer's device does can suppress them.
 *
 * ── The rule against double counting ────────────────────────────────────
 *
 * Reporting an event twice is worse than not reporting it: it inflates revenue,
 * it corrupts return-on-ad-spend, and it teaches the ad platform to bid on the
 * wrong thing. Both halves therefore run under one rule, drawn differently per
 * destination because the two platforms differ in what they can deduplicate:
 *
 *   META — browser *and* server send every event, sharing an `event_id`. Meta
 *   collapses the pair, keeps whichever arrived first, and takes the signals
 *   from both. This is Meta's own recommended setup and it is why the pixel
 *   stays on the page.
 *
 *   GA4 — the server sends every event and the browser sends none. GA4 has no
 *   deduplication worth the name, so two copies are two conversions. gtag.js is
 *   still loaded, with `send_page_view: false`, for one job: it owns the `_ga`
 *   cookies, and reading those is what puts a server-reported purchase inside
 *   the session that produced it.
 *
 * And beneath both, the platform's own guarantee: a purchase is written to
 * `TrackingDelivery` under a unique `(destination, dedupeKey)`, so a retried
 * submission, a replayed cart or an overlapping retry sweep cannot produce a
 * second send in the first place. The ad platforms' deduplication is the
 * fallback, not the mechanism.
 *
 * ── What is retried, and what is merely recorded ────────────────────────
 *
 * Purchases are queued and retried. Everything else is sent once, from the
 * render, and its outcome written to the same table as a terminal row. The
 * asymmetry in *retrying* is deliberate: a lost page view is noise inside a
 * much larger number, and by the time a retry landed it would be reporting a
 * visit that ended long ago. A lost purchase is the number the merchant prices
 * their advertising with.
 *
 * The asymmetry in *recording* was a mistake, now corrected. Only purchases
 * left a trace, so a merchant whose pixel was 400-ing on every page view had no
 * way to discover it — the events simply never arrived and nothing anywhere
 * said so. Every event is logged now, which is what the tracking page reads.
 *
 * That does make this the highest-volume table in the database, which is why
 * `pruneTrackingDeliveries` exists: terminal rows are dropped after
 * TRACKING_LOG_RETENTION_DAYS. Diagnosing a misconfigured pixel takes hours,
 * not months, so nothing of value is kept past that.
 */

/** Attempts per delivery, including the first. */
const MAX_ATTEMPTS = 5

/**
 * Backoff between attempts, in seconds: 15s, 1m, 5m, 30m.
 *
 * The whole schedule finishes inside 40 minutes, and that ceiling is not a
 * matter of taste: GA4 discards events whose timestamp is more than 72 hours
 * old and Meta rejects anything older than seven days, so a queue that retried
 * for days would be delivering events that are silently thrown away at the
 * other end. Failing loudly while the merchant can still act is more useful.
 */
const RETRY_BACKOFF_SECONDS = [15, 60, 300, 1800]

/** Deliveries drained per sweep, so one cron tick cannot run unbounded. */
const RETRY_BATCH_SIZE = 100

const ERROR_SNIPPET_LENGTH = 500

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Refuses a store that belongs to someone else.
 *
 * `requireOrgAccess` proves the caller is in *an* organisation; this proves the
 * store they named is in *that* one. Without the second check, a member of any
 * workspace could read another tenant's conversion log by guessing a store id.
 */
async function requireStoreInOrg(organizationId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')
}

/** The columns `trackingConfigFrom` needs, so callers can select exactly these. */
export interface StoredIntegrationCredentials {
  metaPixelId: string | null
  metaAccessToken: string | null
  metaTestEventCode: string | null
  gaMeasurementId: string | null
  ga4ApiSecret: string | null
}

/**
 * Turns a stored integration row into usable credentials.
 *
 * Takes the row rather than a store id because the storefront renderer has
 * already loaded it — the tag ids and the tokens live in the same row, and
 * reading it twice per page view to decrypt half of it would be a query spent
 * on nothing.
 *
 * A destination needs both halves to be usable: a pixel id alone still renders
 * the browser tag, but there is no server-side reporting without a token. That
 * is what makes presence of the secret the on-switch, with no separate flag to
 * fall out of step with it.
 */
export function trackingConfigFrom(
  storeId: string,
  stored: StoredIntegrationCredentials | null
): TrackingConfig | null {
  if (!stored) return null

  // A credential that will not decrypt is treated as absent rather than thrown.
  // Rotating AUTH_SECRET without re-encrypting these columns must degrade to
  // "no server-side tracking", never to a storefront that refuses to render.
  const accessToken = stored.metaAccessToken
    ? safeDecrypt(stored.metaAccessToken)
    : null
  const apiSecret = stored.ga4ApiSecret
    ? safeDecrypt(stored.ga4ApiSecret)
    : null

  const meta =
    stored.metaPixelId && accessToken
      ? {
          pixelId: stored.metaPixelId,
          accessToken,
          testEventCode: stored.metaTestEventCode,
        }
      : null

  const ga4 =
    stored.gaMeasurementId && apiSecret
      ? { measurementId: stored.gaMeasurementId, apiSecret }
      : null

  if (!meta && !ga4) return null
  return { storeId, meta, ga4 }
}

/**
 * The store's tracking credentials, decrypted.
 *
 * For callers that do not already hold the integration row — the order route,
 * the retry sweep and the test button.
 */
export async function resolveTrackingConfig(
  storeId: string
): Promise<TrackingConfig | null> {
  const stored = await prisma.storeIntegrationConfig.findUnique({
    where: { storeId },
    select: {
      metaPixelId: true,
      metaAccessToken: true,
      metaTestEventCode: true,
      gaMeasurementId: true,
      ga4ApiSecret: true,
    },
  })

  return trackingConfigFrom(storeId, stored)
}

function safeDecrypt(value: string): string | null {
  try {
    return decryptSecret(value)
  } catch (cause) {
    console.error('[tracking] could not decrypt a stored credential', cause)
    return null
  }
}

// ── Identity ──────────────────────────────────────────────────────────────

/** The subset of `headers()`/`cookies()` this module actually needs. */
export interface HeaderReader {
  get(name: string): string | null
}
export interface CookieReader {
  get(name: string): { value: string } | undefined
}

/**
 * Assembles who this visitor is, from what the request carries.
 *
 * Order of preference is the point. For Meta's ids the proxy's headers win,
 * because on the landing request they hold a click id that has been captured
 * but not yet round-tripped through a cookie; the cookies win afterwards, when
 * there are no headers because the request went straight to an API route. For
 * GA4's client id, gtag's own `_ga` cookie wins over ours — using our fallback
 * while gtag is present would split one visitor into two users, one of whom
 * never converts.
 */
export function readTrackingIdentity(input: {
  headers: HeaderReader
  cookies: CookieReader
  measurementId: string | null
  ip: string | null
  userAgent: string | null
}): TrackingIdentity {
  const { headers, cookies, measurementId } = input

  const fbp = headers.get(FBP_HEADER) ?? cookies.get(FBP_COOKIE)?.value ?? null
  const fbc = headers.get(FBC_HEADER) ?? cookies.get(FBC_COOKIE)?.value ?? null

  const gaClientId = parseGaClientId(cookies.get(GA_COOKIE)?.value)
  const fallbackClientId =
    headers.get(CLIENT_ID_HEADER) ??
    cookies.get(FALLBACK_CLIENT_ID_COOKIE)?.value ??
    null

  const sessionId = measurementId
    ? parseGaSessionId(cookies.get(gaSessionCookieName(measurementId))?.value)
    : null

  return {
    fbp,
    fbc,
    // Minting here as a last resort keeps GA4 from rejecting the event
    // outright. It is worse than either cookie — the conversion lands as a new
    // direct-traffic user — and still better than a sale GA4 never counts.
    clientId: gaClientId ?? fallbackClientId ?? mintClientId(),
    sessionId,
    ip: input.ip,
    userAgent: input.userAgent,
  }
}

// ── Page-level events (best effort) ───────────────────────────────────────

/**
 * What a landing page is selling, as an event sees it.
 *
 * Keyed by variant id rather than SKU, unlike a purchase — a rendered offer
 * knows its variants but not their SKUs, and a second query per page view to
 * find out would cost more than the catalogue match it might buy.
 */
export interface PageOfferSnapshot {
  currencyCode: string
  headlinePriceCents: number
  items: TrackedItem[]
}

/**
 * Reports a storefront page view, and a product view when the page sells
 * something.
 *
 * Call from the render's `after()`: this makes two outbound requests per
 * destination and must never sit in front of the buyer's page. Nothing is
 * queued and nothing is retried — see the module comment for why the money
 * events are treated differently.
 *
 * `metaEventIds` come from the caller because the browser tag on that same
 * render fires with them too; they are what stops Meta counting the view twice.
 */
export async function trackPageEvents(input: {
  config: TrackingConfig
  identity: TrackingIdentity
  sourceUrl: string
  pageTitle: string | null
  referrer: string | null
  /**
   * What the page leads with, or null when it sells nothing — in which case no
   * product view is reported, because there is no product to have viewed.
   */
  offer: PageOfferSnapshot | null
  metaEventIds: { pageView: string; viewContent: string }
}): Promise<void> {
  const { config, identity, metaEventIds } = input
  const occurredAt = new Date()

  const base = {
    occurredAt,
    sourceUrl: input.sourceUrl,
    pageTitle: input.pageTitle,
    referrer: input.referrer,
    identity,
  }

  const events: { name: TrackingEventName; event: TrackedEvent }[] = [
    { name: 'PAGE_VIEW', event: { ...base, eventId: metaEventIds.pageView } },
  ]
  if (input.offer) {
    events.push({
      name: 'VIEW_CONTENT',
      event: {
        ...base,
        eventId: metaEventIds.viewContent,
        // The headline price, which is what the page is advertising. It gives
        // both platforms a value to optimise towards on the upper funnel —
        // without one, a product view is a bare count and Meta cannot tell a
        // ৳200 page from a ৳5,000 one.
        value: {
          currencyCode: input.offer.currencyCode,
          amountCents: input.offer.headlinePriceCents,
          items: input.offer.items,
        },
      },
    })
  }

  const sends: Promise<unknown>[] = []
  for (const { name, event } of events) {
    if (config.meta) {
      const payload = buildMetaEvent(name, event)
      sends.push(
        sendMetaEvent(config.meta, payload).then((outcome) =>
          recordDirectSend(
            config.storeId,
            'META_CAPI',
            name,
            event,
            payload,
            outcome
          )
        )
      )
    }
    if (config.ga4) {
      const payload = buildGa4Payload(name, event)
      sends.push(
        sendGa4Event(config.ga4, payload).then((outcome) =>
          recordDirectSend(
            config.storeId,
            'GA4_MP',
            name,
            event,
            payload,
            outcome
          )
        )
      )
    }
  }

  // Never throws: this runs in `after()`, where an unhandled rejection is an
  // error log on a response that already went out fine.
  await Promise.allSettled(sends)
}

/**
 * Writes the outcome of an already-sent event to the delivery log.
 *
 * Upper-funnel events are sent directly rather than queued, and that is
 * deliberate — a page view is worthless by the time a retry would deliver it,
 * and queueing every one would mean a row and a sweep per visitor. But "not
 * worth retrying" is not the same as "not worth knowing about": until this
 * existed, a merchant whose pixel was silently 400-ing on every page view had
 * no way to find out, because only purchases left a trace.
 *
 * So the row is written terminal — `nextAttemptAt` null, so the retry sweep
 * ignores it — purely so the tracking page can show it.
 */
async function recordDirectSend(
  storeId: string,
  destination: TrackingDestination,
  eventName: TrackingEventName,
  event: TrackedEvent,
  payload: Record<string, unknown>,
  outcome: DeliveryOutcome
): Promise<void> {
  try {
    await prisma.trackingDelivery.create({
      data: {
        storeId,
        destination,
        eventName,
        eventId: event.eventId,
        // The event id is already unique per browser event; scoping the key by
        // destination is what the table's unique constraint does for us.
        dedupeKey: event.eventId,
        payload: payload as never,
        status: outcome.ok ? 'SUCCEEDED' : 'FAILED',
        attempts: 1,
        statusCode: outcome.statusCode,
        error: outcome.ok ? null : outcome.message,
        responseBody: outcome.message,
        nextAttemptAt: null,
        completedAt: new Date(),
      },
    })
  } catch {
    // A duplicate key means this event was already logged — the same page
    // rendered twice against one event id. Nothing to record and nothing wrong.
  }
}

// ── Purchases (durable) ───────────────────────────────────────────────────

export interface QueuedPurchase {
  /** Handed to the browser so its Meta pixel fires the same event, once. */
  eventId: string
  /**
   * The exact `custom_data` this server sent, for the browser to repeat.
   *
   * Returned rather than letting the form assemble its own from what it has on
   * screen: Meta keeps one copy of a deduplicated pair, and if the two disagree
   * about the total then which figure ends up in the merchant's reporting comes
   * down to which request won a race. Null when the store has no browser pixel
   * to mirror with.
   */
  pixel: { payload: Record<string, unknown> } | null
}

/**
 * Queues the purchase for every configured destination.
 *
 * The order is read back from the database rather than taken from the caller on
 * purpose: what gets reported to an ad platform has to be what was actually
 * sold and actually charged, not what a browser posted. `checkoutService` is
 * already the authority on both, and a landing page that could dictate the
 * revenue figure in a merchant's ad reporting would be a way to defraud them.
 *
 * Returns null when nothing is configured, so the caller can skip the browser
 * mirror too.
 */
export async function queuePurchaseConversion(input: {
  storeId: string
  orderId: string
  sourceUrl: string
  /**
   * The request's own headers, cookies and client details. Passed raw rather
   * than as a resolved identity so the GA4 session cookie — whose name depends
   * on the measurement id — can be read once the config is known, without the
   * caller having to look the config up first.
   */
  request: {
    headers: HeaderReader
    cookies: CookieReader
    ip: string | null
    userAgent: string | null
  }
}): Promise<QueuedPurchase | null> {
  try {
    const config = await resolveTrackingConfig(input.storeId)
    if (!config) return null

    const identity = readTrackingIdentity({
      headers: input.request.headers,
      cookies: input.request.cookies,
      measurementId: config.ga4?.measurementId ?? null,
      ip: input.request.ip,
      userAgent: input.request.userAgent,
    })

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        orderNumber: true,
        totalCents: true,
        currencyCode: true,
        email: true,
        phone: true,
        shippingAddress: true,
        shippingCountryCode: true,
        lines: {
          select: {
            title: true,
            sku: true,
            variantId: true,
            productId: true,
            quantity: true,
            unitPriceCents: true,
          },
        },
      },
    })
    if (!order) return null

    // Deterministic, so the browser's copy and this one agree without the two
    // having to coordinate, and so a replayed cart — which returns the very
    // same order — produces the very same event id rather than a second sale.
    const eventId = `purchase.${input.orderId}`

    const event: TrackedEvent = {
      eventId,
      occurredAt: new Date(),
      sourceUrl: input.sourceUrl,
      transactionId: order.orderNumber,
      value: {
        currencyCode: order.currencyCode,
        amountCents: order.totalCents,
        items: order.lines.map((line): TrackedItem => ({
          // SKU first: a merchant's product feed at Meta or Google is keyed
          // by it, and an id that is not in the feed matches no catalogue
          // entry and cannot drive a dynamic ad.
          id: line.sku ?? line.variantId ?? line.productId ?? 'unknown',
          name: line.title,
          quantity: line.quantity,
          priceCents: line.unitPriceCents,
        })),
      },
      customer: buildCustomerDetails(order),
      identity,
    }

    const metaEvent = config.meta ? buildMetaEvent('PURCHASE', event) : null

    const rows = buildDeliveryRows(config, 'PURCHASE', event, {
      dedupeKey: `purchase:${input.orderId}`,
      metaEvent,
    })

    // `skipDuplicates` against the unique (destination, dedupeKey) index is the
    // whole guarantee. Two concurrent submissions of one order race here, and
    // the loser inserts nothing at all.
    await prisma.trackingDelivery.createMany({
      data: rows,
      skipDuplicates: true,
    })

    const pending = await prisma.trackingDelivery.findMany({
      where: {
        dedupeKey: `purchase:${input.orderId}`,
        status: 'PENDING',
      },
      select: { id: true },
    })
    scheduleDispatch(pending.map((row) => row.id))

    const customData = metaEvent?.custom_data
    return {
      eventId,
      pixel:
        customData && typeof customData === 'object'
          ? { payload: customData as Record<string, unknown> }
          : null,
    }
  } catch (cause) {
    // A sale is never lost to a tracking problem. The order is placed; this is
    // reporting about it.
    console.error('[tracking] could not queue the purchase', cause)
    return null
  }
}

/** The buyer details worth sending, pulled off the placed order. */
function buildCustomerDetails(order: {
  email: string | null
  phone: string | null
  shippingAddress: unknown
  shippingCountryCode: string | null
}) {
  const address = (order.shippingAddress ?? {}) as Record<string, unknown>
  const rawName = typeof address.firstName === 'string' ? address.firstName : ''
  const { firstName, lastName } = splitName(rawName)

  return {
    email: order.email,
    phone: order.phone,
    firstName,
    lastName,
    city: typeof address.city === 'string' ? address.city : null,
    countryCode:
      order.shippingCountryCode ??
      (typeof address.countryCode === 'string' ? address.countryCode : null),
  }
}

/** One queue row per configured destination, each with its wire payload baked in. */
function buildDeliveryRows(
  config: TrackingConfig,
  eventName: TrackingEventName,
  event: TrackedEvent,
  options: { dedupeKey: string; metaEvent: Record<string, unknown> | null }
) {
  const rows: {
    storeId: string
    destination: TrackingDestination
    eventName: TrackingEventName
    eventId: string
    dedupeKey: string
    payload: object
    nextAttemptAt: Date
  }[] = []

  const common = {
    storeId: config.storeId,
    eventName,
    eventId: event.eventId,
    dedupeKey: options.dedupeKey,
    nextAttemptAt: new Date(),
  }

  // The payload is built now and replayed verbatim. A retry has to report the
  // sale as it was, and rebuilding it later would re-read an order that may
  // since have been edited, refunded or cancelled.
  if (config.meta) {
    rows.push({
      ...common,
      destination: 'META_CAPI',
      payload: options.metaEvent ?? buildMetaEvent(eventName, event),
    })
  }
  if (config.ga4) {
    rows.push({
      ...common,
      destination: 'GA4_MP',
      payload: buildGa4Payload(eventName, event),
    })
  }

  return rows
}

// ── Delivery ──────────────────────────────────────────────────────────────

/**
 * Sends after the response is on its way, falling back to a floating promise
 * outside a request — the retry cron has no response to wait for, and `after`
 * throws there rather than quietly doing nothing.
 */
function scheduleDispatch(deliveryIds: string[]) {
  if (deliveryIds.length === 0) return

  const run = async () => {
    for (const id of deliveryIds) {
      await dispatchTrackingDelivery(id)
    }
  }

  try {
    after(run)
  } catch {
    void run().catch((cause) => console.error('[tracking] dispatch', cause))
  }
}

/**
 * Sends one queued conversion and records what happened.
 *
 * Re-resolves the store's credentials rather than storing them on the row: a
 * merchant who rotates a leaked access token must not have the old one replayed
 * out of the queue for the next half hour.
 */
export async function dispatchTrackingDelivery(
  deliveryId: string
): Promise<void> {
  const delivery = await prisma.trackingDelivery.findUnique({
    where: { id: deliveryId },
  })
  if (!delivery || delivery.status !== 'PENDING') return

  const config = await resolveTrackingConfig(delivery.storeId)
  const attempt = delivery.attempts + 1
  const payload = delivery.payload as Record<string, unknown>

  if (!config) {
    await recordTerminal(
      delivery.id,
      attempt,
      null,
      'Tracking was switched off before this event could be sent'
    )
    return
  }

  if (delivery.destination === 'META_CAPI') {
    if (!config.meta) {
      await recordTerminal(
        delivery.id,
        attempt,
        null,
        'Meta is no longer configured'
      )
      return
    }
    const outcome = await sendMetaEvent(config.meta, payload)
    await recordOutcome(delivery.id, attempt, outcome, isRetryableMetaStatus)
    return
  }

  if (!config.ga4) {
    await recordTerminal(
      delivery.id,
      attempt,
      null,
      'GA4 is no longer configured'
    )
    return
  }
  const outcome = await sendGa4Event(config.ga4, payload)
  await recordOutcome(delivery.id, attempt, outcome, isRetryableGa4Status)
}

async function recordOutcome(
  deliveryId: string,
  attempt: number,
  outcome: { ok: boolean; statusCode: number | null; message: string | null },
  isRetryable: (statusCode: number | null) => boolean
) {
  if (outcome.ok) {
    await prisma.trackingDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SUCCEEDED',
        attempts: attempt,
        statusCode: outcome.statusCode,
        responseBody: outcome.message?.slice(0, ERROR_SNIPPET_LENGTH) ?? null,
        error: null,
        nextAttemptAt: null,
        completedAt: new Date(),
      },
    })
    return
  }

  // A rejected token or a malformed event fails the same way every time.
  // Spending four more attempts on it only delays the moment the merchant sees
  // the error on their settings page.
  const giveUp = attempt >= MAX_ATTEMPTS || !isRetryable(outcome.statusCode)
  if (giveUp) {
    await recordTerminal(
      deliveryId,
      attempt,
      outcome.statusCode,
      outcome.message ?? 'Delivery failed'
    )
    return
  }

  const backoff =
    RETRY_BACKOFF_SECONDS[attempt - 1] ??
    RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1]!

  await prisma.trackingDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'PENDING',
      attempts: attempt,
      statusCode: outcome.statusCode,
      error: outcome.message?.slice(0, ERROR_SNIPPET_LENGTH) ?? null,
      nextAttemptAt: new Date(Date.now() + backoff * 1_000),
    },
  })
}

async function recordTerminal(
  deliveryId: string,
  attempt: number,
  statusCode: number | null,
  message: string
) {
  await prisma.trackingDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'FAILED',
      attempts: attempt,
      statusCode,
      error: message.slice(0, ERROR_SNIPPET_LENGTH),
      nextAttemptAt: null,
      completedAt: new Date(),
    },
  })
}

/**
 * Retries every delivery whose backoff has elapsed. Driven by the cron route.
 *
 * Claims each row before sending by pushing `nextAttemptAt` forward, so two
 * overlapping sweeps cannot both send the same conversion — the unique dedupe
 * key protects against a duplicate *event*, but not against two sends of the
 * same row, and Meta would receive that as one event twice rather than two
 * events it can collapse.
 */
export async function retryPendingTrackingDeliveries(): Promise<number> {
  const due = await prisma.trackingDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: RETRY_BATCH_SIZE,
  })

  let attempted = 0
  for (const row of due) {
    const claimed = await prisma.trackingDelivery.updateMany({
      where: {
        id: row.id,
        status: 'PENDING',
        nextAttemptAt: { lte: new Date() },
      },
      data: { nextAttemptAt: new Date(Date.now() + 60_000) },
    })
    if (claimed.count === 0) continue

    attempted += 1
    await dispatchTrackingDelivery(row.id)
  }

  return attempted
}

// ── Setup verification ────────────────────────────────────────────────────

export interface TrackingTestResult {
  destination: 'meta' | 'ga4'
  ok: boolean
  message: string
}

/**
 * Sends one throwaway event to each configured destination and reports what
 * came back.
 *
 * This is the difference between tracking a merchant can set up and tracking
 * they can only hope they set up, because in normal operation neither platform
 * says a word when it is wrong: GA4 answers 204 to everything it is ever sent,
 * so a typo in an API secret is invisible until a month of empty reports.
 *
 * The two are not equally checkable, and this does not pretend otherwise. Meta
 * validates the credential and returns a usable error — a bad token comes back
 * as "Invalid OAuth access token". Google validates only the payload, so its
 * result says what was checked and points the merchant at Realtime for the rest.
 */
export async function sendTrackingTestEvent(
  organizationId: string,
  storeId: string,
  sourceUrl: string
): Promise<TrackingTestResult[]> {
  // Guarded here rather than relying on the caller: this spends a merchant's
  // API quota and writes into their ad account's event stream.
  await requireOrgAccess(organizationId, 'EDITOR')
  await requireStoreInOrg(organizationId, storeId)

  const config = await resolveTrackingConfig(storeId)
  if (!config) return []

  const event: TrackedEvent = {
    eventId: `test.${storeId}.${Date.now()}`,
    occurredAt: new Date(),
    sourceUrl,
    identity: {
      fbp: null,
      fbc: null,
      clientId: mintClientId(),
      sessionId: null,
      ip: null,
      userAgent: 'NCOM-Tracking-Test/1',
    },
  }

  const results: TrackingTestResult[] = []

  if (config.meta) {
    const outcome = await sendMetaEvent(
      config.meta,
      buildMetaEvent('PAGE_VIEW', event)
    )
    results.push({
      destination: 'meta',
      ok: outcome.ok,
      message: outcome.ok
        ? config.meta.testEventCode
          ? 'Meta accepted the event — it should appear under Test Events in Events Manager.'
          : 'Meta accepted the event.'
        : (outcome.message ?? 'Meta rejected the event.'),
    })
  }

  if (config.ga4) {
    const payload = buildGa4Payload('PAGE_VIEW', event)

    // Two calls, because neither answers the whole question. The validation
    // endpoint checks the payload and says precisely what is malformed, but it
    // accepts any measurement id and any secret — a typo in either passes.
    // Nothing Google offers will confirm a credential synchronously, so the
    // second call sends the event for real and the merchant confirms it in
    // Realtime. Saying so is better than a green tick that proves nothing.
    const validation = await sendGa4Event(config.ga4, payload, {
      validateOnly: true,
    })

    if (!validation.ok) {
      results.push({
        destination: 'ga4',
        ok: false,
        message: validation.message ?? 'Google rejected the event.',
      })
    } else {
      const sent = await sendGa4Event(config.ga4, payload)
      results.push({
        destination: 'ga4',
        ok: sent.ok,
        message: sent.ok
          ? 'Event sent. Google never reports a wrong measurement ID or API secret, so confirm it in GA4 under Reports → Realtime — a page view should appear within a minute.'
          : (sent.message ?? 'Google could not be reached.'),
      })
    }
  }

  return results
}

/**
 * The last few conversions sent, for the settings page.
 *
 * "Did my sale reach Meta?" is the only question a merchant asks of this
 * feature after setup, and it deserves an answer that is not a support ticket.
 */
export async function recentTrackingDeliveries(
  organizationId: string,
  storeId: string,
  take = 5
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await requireStoreInOrg(organizationId, storeId)

  return prisma.trackingDelivery.findMany({
    where: { storeId },
    select: {
      id: true,
      destination: true,
      eventName: true,
      status: true,
      attempts: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take,
  })
}

// ── Log retention and reporting ───────────────────────────────────────────

/**
 * How long a finished delivery stays readable.
 *
 * Long enough to answer "why did yesterday's conversions not arrive", short
 * enough that logging every page view for every destination does not become an
 * unbounded table. Pending rows are never pruned — one that is still retrying
 * has not finished, however old it looks.
 */
const TRACKING_LOG_RETENTION_DAYS = 30

export async function pruneTrackingDeliveries(): Promise<number> {
  const cutoff = new Date(
    Date.now() - TRACKING_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  )

  const { count } = await prisma.trackingDelivery.deleteMany({
    where: {
      status: { in: ['SUCCEEDED', 'FAILED'] },
      createdAt: { lt: cutoff },
    },
  })

  return count
}

export interface TrackingEventFilters {
  storeId?: string
  destination?: TrackingDestination
  eventName?: TrackingEventName
  status?: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  /** Free text over the event id, for tracing one conversion end to end. */
  search?: string
  take?: number
  skip?: number
}

/**
 * The tracking page's list, scoped to the caller's organisation.
 *
 * Scoped by `store: { organizationId }` rather than by a store id the caller
 * passed: the delivery log carries hashed customer data and exactly what was
 * sent to an ad platform, and a tenant reading another tenant's would be
 * reading their customer list and their revenue.
 */
export async function listTrackingEvents(
  organizationId: string,
  filters: TrackingEventFilters = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const take = Math.min(filters.take ?? 50, 200)

  const where = {
    store: { organizationId },
    ...(filters.storeId ? { storeId: filters.storeId } : {}),
    ...(filters.destination ? { destination: filters.destination } : {}),
    ...(filters.eventName ? { eventName: filters.eventName } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search ? { eventId: { contains: filters.search } } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.trackingDelivery.findMany({
      where,
      select: {
        id: true,
        destination: true,
        eventName: true,
        eventId: true,
        status: true,
        attempts: true,
        statusCode: true,
        error: true,
        responseBody: true,
        payload: true,
        createdAt: true,
        completedAt: true,
        nextAttemptAt: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip: filters.skip ?? 0,
    }),
    prisma.trackingDelivery.count({ where }),
  ])

  return { items, total }
}

export interface TrackingHealth {
  total: number
  succeeded: number
  failed: number
  pending: number
  /** Success rate in basis points, so the caller can render it exactly. */
  successRateBps: number
  byDestination: {
    destination: TrackingDestination
    total: number
    failed: number
  }[]
  byEvent: { eventName: TrackingEventName; total: number; failed: number }[]
}

/**
 * The headline numbers for the tracking page, over a window.
 *
 * Grouped by destination and by event because those are the two questions a
 * broken setup produces: "is Meta down or is it everything", and "is it all
 * events or only purchases". A single overall success rate answers neither.
 */
export async function trackingHealth(
  organizationId: string,
  options: { sinceHours?: number; storeId?: string } = {}
): Promise<TrackingHealth> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const since = new Date(
    Date.now() - (options.sinceHours ?? 24) * 60 * 60 * 1000
  )

  const where = {
    store: { organizationId },
    ...(options.storeId ? { storeId: options.storeId } : {}),
    createdAt: { gte: since },
  }

  const [byDestination, byEvent] = await Promise.all([
    prisma.trackingDelivery.groupBy({
      by: ['destination', 'status'],
      where,
      _count: { _all: true },
    }),
    prisma.trackingDelivery.groupBy({
      by: ['eventName', 'status'],
      where,
      _count: { _all: true },
    }),
  ])

  let succeeded = 0
  let failed = 0
  let pending = 0

  const destinations = new Map<
    TrackingDestination,
    { total: number; failed: number }
  >()
  for (const row of byDestination) {
    const count = row._count._all
    if (row.status === 'SUCCEEDED') succeeded += count
    else if (row.status === 'FAILED') failed += count
    else pending += count

    const entry = destinations.get(row.destination) ?? { total: 0, failed: 0 }
    entry.total += count
    if (row.status === 'FAILED') entry.failed += count
    destinations.set(row.destination, entry)
  }

  const events = new Map<TrackingEventName, { total: number; failed: number }>()
  for (const row of byEvent) {
    const count = row._count._all
    const entry = events.get(row.eventName) ?? { total: 0, failed: 0 }
    entry.total += count
    if (row.status === 'FAILED') entry.failed += count
    events.set(row.eventName, entry)
  }

  const total = succeeded + failed + pending

  return {
    total,
    succeeded,
    failed,
    pending,
    // Pending is excluded from the denominator: a delivery still retrying has
    // not failed yet, and counting it as a miss makes a healthy queue look sick.
    successRateBps:
      succeeded + failed > 0
        ? Math.round((succeeded / (succeeded + failed)) * 10_000)
        : 10_000,
    byDestination: [...destinations].map(([destination, value]) => ({
      destination,
      ...value,
    })),
    byEvent: [...events].map(([eventName, value]) => ({ eventName, ...value })),
  }
}
