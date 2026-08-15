import 'server-only'
import { minorUnitsPerMajor } from '@/lib/money'
import type {
  DeliveryOutcome,
  TrackedEvent,
  TrackingConfig,
} from '@/lib/tracking/types'
import type { TrackingEventName } from '@/generated/prisma/client'

/**
 * GA4 Measurement Protocol.
 *
 * Where Meta gets the same event from both halves and deduplicates, GA4 gets
 * each event from exactly one half — because GA4 has no deduplication to lean
 * on. Its Measurement Protocol accepts whatever it is sent and counts it, so
 * two copies of a sale are two sales in the merchant's revenue report.
 *
 * The split is therefore drawn in code rather than negotiated at runtime:
 * gtag.js is loaded with `send_page_view: false` and never asked to report a
 * conversion, and everything in the funnel is sent from here. gtag stays on the
 * page for one reason — it owns the `_ga` cookies, and those are what let a
 * server-reported purchase land inside the session that produced it instead of
 * a phantom session with no traffic source. When gtag is blocked, the fallback
 * client id keeps the sale countable at the cost of its attribution.
 *
 * The protocol's worst property is worth stating plainly: it answers 204 to
 * everything, including events it discards. There is no success to observe.
 * That is why `sendGa4Event` supports the validation endpoint, and why the
 * settings page's test button uses it — it is the only way to find out that a
 * measurement id is wrong before a month of reports comes back empty.
 */

const COLLECT_URL = 'https://www.google-analytics.com/mp/collect'
const DEBUG_URL = 'https://www.google-analytics.com/debug/mp/collect'

const REQUEST_TIMEOUT_MS = 10_000

/** Our vocabulary to GA4's recommended-event names. */
const EVENT_NAMES: Record<TrackingEventName, string> = {
  PAGE_VIEW: 'page_view',
  VIEW_CONTENT: 'view_item',
  PURCHASE: 'purchase',
}

/**
 * Required on every event or GA4 attributes the session to nothing and reports
 * the user as non-engaged. One millisecond is the conventional value for an
 * event a server is reporting on the browser's behalf — the real engagement
 * time is not knowable from here, and overstating it would distort the
 * merchant's average-engagement metric.
 */
const ENGAGEMENT_TIME_MSEC = 1

function toMajorUnits(cents: number, currencyCode: string): number {
  return cents / minorUnitsPerMajor(currencyCode)
}

/**
 * Builds one Measurement Protocol request body.
 *
 * Stored on the queue row and replayed verbatim, like the Meta payload — with
 * one caveat that shapes the retry schedule: GA4 discards events whose
 * `timestamp_micros` is more than 72 hours old, so a delivery that exhausts its
 * backoff has to fail rather than linger.
 */
export function buildGa4Payload(
  eventName: TrackingEventName,
  event: TrackedEvent
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    engagement_time_msec: ENGAGEMENT_TIME_MSEC,
    page_location: event.sourceUrl,
  }

  if (event.identity.sessionId) params.session_id = event.identity.sessionId
  if (event.pageTitle) params.page_title = event.pageTitle
  // The referrer is what GA4 derives source/medium from. Without it a
  // server-sent page view is direct traffic, and every campaign report goes
  // flat — the single most common way a server-side GA4 setup looks "broken".
  if (event.referrer) params.page_referrer = event.referrer

  if (event.value) {
    const { currencyCode, amountCents, items } = event.value
    params.currency = currencyCode.toUpperCase()
    params.value = toMajorUnits(amountCents, currencyCode)
    params.items = items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      quantity: item.quantity,
      price: toMajorUnits(item.priceCents, currencyCode),
    }))
  }

  // GA4's own purchase deduplication key, and the reason a replayed order
  // cannot inflate revenue even if a duplicate somehow escapes our queue.
  if (event.transactionId) params.transaction_id = event.transactionId

  return {
    client_id: event.identity.clientId,
    timestamp_micros: event.occurredAt.getTime() * 1000,
    events: [{ name: EVENT_NAMES[eventName], params }],
  }
}

/**
 * Posts a prepared payload to GA4.
 *
 * `validateOnly` swaps in the validation endpoint, which is the same protocol
 * with one difference that matters: it answers with the problems it found
 * instead of silently accepting the event. Nothing sent there is recorded, so
 * it is safe to call from a test button.
 */
export async function sendGa4Event(
  ga4: NonNullable<TrackingConfig['ga4']>,
  payload: Record<string, unknown>,
  { validateOnly = false }: { validateOnly?: boolean } = {}
): Promise<DeliveryOutcome> {
  const url = new URL(validateOnly ? DEBUG_URL : COLLECT_URL)
  url.searchParams.set('measurement_id', ga4.measurementId)
  url.searchParams.set('api_secret', ga4.apiSecret)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        message: `Google responded ${response.status}`,
      }
    }

    if (!validateOnly) {
      // A 2xx from the collection endpoint means "received", never "accepted".
      return { ok: true, statusCode: response.status, message: null }
    }

    const problems = await readValidationMessages(response)
    return problems
      ? { ok: false, statusCode: response.status, message: problems }
      : { ok: true, statusCode: response.status, message: null }
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.name === 'TimeoutError'
          ? `No response from Google within ${REQUEST_TIMEOUT_MS / 1000}s`
          : cause.message
        : 'Request to Google failed'
    return { ok: false, statusCode: null, message }
  }
}

/**
 * Reads the validation endpoint's complaints, if it had any.
 *
 * An empty `validationMessages` array is the only thing GA4 ever says that
 * means "this event is correct", so it is worth surfacing verbatim: its
 * descriptions name the offending field, which is exactly what a merchant who
 * pasted the wrong secret needs to read.
 */
async function readValidationMessages(
  response: Response
): Promise<string | null> {
  try {
    const parsed = (await response.json()) as {
      validationMessages?: { fieldPath?: string; description?: string }[]
    }
    const messages = parsed.validationMessages ?? []
    if (messages.length === 0) return null

    return messages
      .map((message) =>
        message.fieldPath
          ? `${message.fieldPath}: ${message.description ?? 'invalid'}`
          : (message.description ?? 'invalid')
      )
      .join('; ')
  } catch {
    return null
  }
}

/**
 * Whether a failed attempt is worth retrying.
 *
 * The collection endpoint only really fails on transport or on Google's own
 * 5xx; a 4xx here means the measurement id or secret is wrong, and no number of
 * retries will change that.
 */
export function isRetryableGa4Status(statusCode: number | null): boolean {
  if (statusCode === null) return true
  if (statusCode === 429) return true
  return statusCode >= 500
}
