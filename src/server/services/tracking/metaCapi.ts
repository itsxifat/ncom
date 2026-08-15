import 'server-only'
import { minorUnitsPerMajor } from '@/lib/money'
import { hashCustomerDetails } from '@/lib/tracking/hash'
import type {
  DeliveryOutcome,
  TrackedEvent,
  TrackingConfig,
} from '@/lib/tracking/types'
import type { TrackingEventName } from '@/generated/prisma/client'

/**
 * Meta Conversions API.
 *
 * The same conversion the browser pixel reports, sent again from here. That
 * sounds like double counting and is the opposite: `event_id` is shared between
 * the two copies, Meta collapses them, and what the merchant gets is an event
 * that survives whichever half fails. On mobile in this market the browser half
 * fails often — tracking protection, an ad blocker, a tab closed before
 * `fbevents.js` finished loading — and the server half does not depend on the
 * buyer's device cooperating at all.
 *
 * Meta's own guidance is to send both rather than to replace one with the
 * other, because each carries signal the other cannot. The browser knows the
 * cookies; the server knows the order, the verified total and the buyer's real
 * phone number. Together they produce a match rate neither reaches alone.
 */

/**
 * Pinned rather than tracking "latest".
 *
 * Meta deprecates a Graph version roughly every two years, and an unpinned
 * caller silently starts speaking a dialect it was never tested against. This
 * version is bumped deliberately, after reading the changelog.
 */
const GRAPH_VERSION = 'v21.0'

/** Long enough for Meta on a bad day, short enough not to hold the queue. */
const REQUEST_TIMEOUT_MS = 10_000

/** Kept for the merchant-facing status panel. Meta's errors are descriptive. */
const RESPONSE_SNIPPET_LENGTH = 1_000

/** Our vocabulary to Meta's. */
const EVENT_NAMES: Record<TrackingEventName, string> = {
  PAGE_VIEW: 'PageView',
  VIEW_CONTENT: 'ViewContent',
  PURCHASE: 'Purchase',
}

/**
 * Money for Meta is a decimal in major units, not the integer minor units
 * everything in this codebase stores. Sending 185000 paisa where Meta expects
 * 1850.00 taka reports a sale a hundred times too large, which is the kind of
 * error that quietly ruins a merchant's return-on-ad-spend for a month before
 * anyone notices.
 */
function toMajorUnits(cents: number, currencyCode: string): number {
  return cents / minorUnitsPerMajor(currencyCode)
}

/**
 * Builds one Conversions API event.
 *
 * Exported so the payload can be built once, stored on the queue row, and
 * re-sent verbatim on every retry — a retry must report the event as it
 * happened, not as the world looks an hour later.
 */
export function buildMetaEvent(
  eventName: TrackingEventName,
  event: TrackedEvent
): Record<string, unknown> {
  const userData: Record<string, unknown> = {
    ...hashCustomerDetails(event.customer ?? {}),
  }

  // Unhashed by design — Meta hashes neither, and both are the event's own
  // context rather than a matching key.
  if (event.identity.ip) userData.client_ip_address = event.identity.ip
  if (event.identity.userAgent) {
    userData.client_user_agent = event.identity.userAgent
  }
  if (event.identity.fbp) userData.fbp = event.identity.fbp
  if (event.identity.fbc) userData.fbc = event.identity.fbc

  const payload: Record<string, unknown> = {
    event_name: EVENT_NAMES[eventName],
    // Seconds, not milliseconds. Meta rejects anything more than seven days
    // old, which the retry schedule stays well inside.
    event_time: Math.floor(event.occurredAt.getTime() / 1000),
    event_id: event.eventId,
    event_source_url: event.sourceUrl,
    // `website` rather than `system_generated`: the buyer really was on a page.
    // Meta weights attribution differently by source, and mislabelling a
    // website conversion suppresses it.
    action_source: 'website',
    user_data: userData,
  }

  if (event.value) {
    const { currencyCode, amountCents, items } = event.value
    payload.custom_data = {
      currency: currencyCode.toUpperCase(),
      value: toMajorUnits(amountCents, currencyCode),
      content_type: 'product',
      contents: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        item_price: toMajorUnits(item.priceCents, currencyCode),
      })),
      ...(event.transactionId ? { order_id: event.transactionId } : {}),
    }
  }

  return payload
}

/**
 * Posts a prepared event to Meta.
 *
 * The access token travels in the body rather than the query string: a URL ends
 * up in access logs, proxy logs and error reports, and a Conversions API token
 * in any of those is enough for someone else to write events into the
 * merchant's ad account.
 */
export async function sendMetaEvent(
  meta: NonNullable<TrackingConfig['meta']>,
  eventPayload: Record<string, unknown>
): Promise<DeliveryOutcome> {
  const body: Record<string, unknown> = {
    data: [eventPayload],
    access_token: meta.accessToken,
  }
  if (meta.testEventCode) body.test_event_code = meta.testEventCode

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${meta.pixelId}/events`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })

    const text = await response.text().catch(() => '')
    const snippet = text.slice(0, RESPONSE_SNIPPET_LENGTH) || null

    if (response.ok) {
      return { ok: true, statusCode: response.status, message: snippet }
    }

    return {
      ok: false,
      statusCode: response.status,
      message: metaErrorMessage(text) ?? `Meta responded ${response.status}`,
    }
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.name === 'TimeoutError'
          ? `No response from Meta within ${REQUEST_TIMEOUT_MS / 1000}s`
          : cause.message
        : 'Request to Meta failed'
    return { ok: false, statusCode: null, message }
  }
}

/**
 * Digs the human-readable half out of Meta's error envelope.
 *
 * Meta answers a bad token and a malformed payload with the same 400, and the
 * difference is only in `error.message`. Surfacing it is what turns a support
 * thread into a merchant fixing their own setup.
 */
function metaErrorMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string; error_user_msg?: string }
    }
    return parsed.error?.error_user_msg ?? parsed.error?.message ?? null
  } catch {
    return null
  }
}

/**
 * Whether a failed attempt is worth retrying.
 *
 * A rejected token or a malformed event will be rejected identically forever;
 * retrying it five more times just delays the moment the merchant is told. Rate
 * limits and Meta's own 5xx are the opposite — those are temporary by
 * definition.
 */
export function isRetryableMetaStatus(statusCode: number | null): boolean {
  if (statusCode === null) return true // transport failure — try again
  if (statusCode === 429) return true
  return statusCode >= 500
}
