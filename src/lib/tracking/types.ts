import type { CustomerDetails } from './hash'

/**
 * The shape of a conversion, before either ad platform's vocabulary is applied.
 *
 * One event description feeds both destinations. Meta calls a sale `Purchase`
 * and Google calls it `purchase`; Meta wants `contents[].item_price` and Google
 * wants `items[].price`. Keeping a neutral shape here means the order pipeline
 * describes what happened exactly once, and adding a third destination later is
 * a translator rather than another call site in the checkout.
 */

/** What the browser knew and the server cannot infer. */
export interface TrackingIdentity {
  /** Meta's browser id (`_fbp`), if one exists or was minted for this visitor. */
  fbp: string | null
  /** Meta's click id (`_fbc`), derived from the ad's `fbclid`. */
  fbc: string | null
  /** GA4's client id — gtag's if it ran, ours if it was blocked. */
  clientId: string
  /** GA4's session id, so the conversion joins the session that produced it. */
  sessionId: string | null
  /**
   * The buyer's address and user agent, not the server's.
   *
   * Both platforms treat these as the event's own — Meta uses them for
   * matching and both use them for geography — so passing the server's would
   * report every sale in the market as coming from the data centre.
   */
  ip: string | null
  userAgent: string | null
}

/** One line of a purchase, in the neutral shape. */
export interface TrackedItem {
  /** The variant id, which is what a merchant's product feed is keyed by. */
  id: string
  name: string
  quantity: number
  /** Unit price in minor units, converted per destination. */
  priceCents: number
}

export interface TrackedEvent {
  /** Shared with the browser tag so Meta collapses the pair into one event. */
  eventId: string
  /** When it happened, not when it is finally delivered after retries. */
  occurredAt: Date
  /** The page the buyer was on. Meta requires it for a `website` event. */
  sourceUrl: string
  pageTitle?: string | null
  referrer?: string | null
  /** Purchases only: total, currency and lines. */
  value?: {
    currencyCode: string
    amountCents: number
    items: TrackedItem[]
  }
  /** Purchases only: the merchant-facing order number, used as GA4's dedupe key. */
  transactionId?: string
  /** Purchases only: whatever the buyer told us, for match quality. */
  customer?: CustomerDetails
  identity: TrackingIdentity
}

/** Resolved credentials for one store. Secrets are already decrypted. */
export interface TrackingConfig {
  storeId: string
  meta: {
    pixelId: string
    accessToken: string
    testEventCode: string | null
  } | null
  ga4: {
    measurementId: string
    apiSecret: string
  } | null
}

/** What a delivery attempt reports back to the queue. */
export interface DeliveryOutcome {
  ok: boolean
  statusCode: number | null
  /** Kept for the merchant-facing status panel and for support threads. */
  message: string | null
}
