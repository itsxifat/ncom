/**
 * The identifiers that make a server-side conversion attributable.
 *
 * A conversion reported from a server is, by default, anonymous: the ad
 * platform receives "someone bought something for ৳1,850" with no way to tie it
 * back to the click it paid for. Everything in this module exists to close that
 * gap, and it is the difference between server-side tracking that measures ads
 * and server-side tracking that merely counts sales.
 *
 * Three identifiers do that work:
 *
 *   `_fbc` — the click. Derived from the `fbclid` query parameter Meta appends
 *   to every ad link, and the only thing that can attribute a purchase to a
 *   specific ad. It has to be captured on the landing request and stored,
 *   because by the time the buyer submits the order form the parameter is long
 *   gone from the URL.
 *
 *   `_fbp` — the browser. A first-party id that lets Meta stitch this visit to
 *   its own view of the same person.
 *
 *   `_ga` / `_ga_<stream>` — the GA4 client and session. Written by gtag.js.
 *   Reading them is what puts a server-reported purchase inside the session
 *   that produced it, rather than in a phantom session of its own with no
 *   traffic source.
 *
 * Why the server writes these cookies rather than reading whatever the tag
 * wrote: the premise of server-side tracking is that the tag may never run. An
 * ad blocker, a tracking-protection default, or a slow network on a mobile
 * connection all end with no `_fbc` cookie and an unattributable sale. Minting
 * them here means the click id survives even when nothing from Meta or Google
 * ever loads — and when the pixel *does* load, it finds a cookie already in the
 * standard format and adopts it, so both halves report the same person.
 *
 * These cookies are deliberately not `httpOnly` (unlike the cart token in
 * lib/storefront-cookies.ts): `fbevents.js` reads `_fbp`/`_fbc` from
 * `document.cookie`, and hiding them from it would make the browser tag mint a
 * second, different pair — the exact split identity this module prevents. They
 * are not credentials; nothing is authorised by holding one.
 *
 * Nothing here reads the database or the environment, so `proxy.ts` can use it.
 */

/** Meta's browser id, in the format `fbevents.js` itself writes. */
export const FBP_COOKIE = '_fbp'
/** Meta's click id, derived from `fbclid`. */
export const FBC_COOKIE = '_fbc'
/** GA4's client id, written by gtag.js. Read only — never minted here. */
export const GA_COOKIE = '_ga'

/**
 * Our own fallback visitor id, shaped like a GA4 client id.
 *
 * Exists for the case the whole feature is built around: gtag.js was blocked,
 * so there is no `_ga` cookie to read, and a purchase with no `client_id` is
 * one GA4 rejects outright. This keeps the conversion countable — it lands as a
 * direct-traffic user rather than an attributed one, which is worse than a real
 * client id and far better than a dropped sale.
 */
export const FALLBACK_CLIENT_ID_COOKIE = 'ncom_cid'

/** 90 days — Meta's own lifetime for `_fbp`/`_fbc`, matched deliberately. */
export const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90

/**
 * Cookie attributes for all of the above.
 *
 * `sameSite: 'lax'` is required rather than merely preferred: an ad click is a
 * cross-site top-level navigation, and under `strict` the cookie would not be
 * sent on the very request that brought the buyer here.
 */
export const attributionCookieOptions = {
  httpOnly: false,
  sameSite: 'lax',
  path: '/',
  maxAge: ATTRIBUTION_COOKIE_MAX_AGE,
  secure: process.env.NODE_ENV === 'production',
} as const

/**
 * The subdomain index in `fb.<index>.<time>.<value>`.
 *
 * Meta defines it as how many levels below the registrable domain the cookie
 * was set on. Every cookie here is written on the exact host serving the
 * storefront — a tenant subdomain or the merchant's own domain — which is the
 * `1` case, and is also what `fbevents.js` writes for the same placement.
 */
const FB_SUBDOMAIN_INDEX = 1

/**
 * Builds an `_fbc` value from a click id.
 *
 * The timestamp is when the click was *first seen*, not when the event is sent,
 * which is why a stored cookie is always preferred over re-deriving this from a
 * URL later in the session.
 */
export function formatFbc(fbclid: string, now: number = Date.now()): string {
  return `fb.${FB_SUBDOMAIN_INDEX}.${now}.${fbclid}`
}

/**
 * Mints an `_fbp` value.
 *
 * The random component is a 10-digit integer because that is the shape
 * `fbevents.js` produces; a value it would not have written itself is a value
 * Meta's own tooling flags as malformed.
 */
export function mintFbp(now: number = Date.now()): string {
  const random = Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)
  return `fb.${FB_SUBDOMAIN_INDEX}.${now}.${random}`
}

/**
 * Mints a GA4-shaped client id: `<random>.<unix seconds>`.
 *
 * Matching gtag.js's format matters — GA4 derives the user's first-seen time
 * from the second half, and a client id it cannot parse is a user it silently
 * drops.
 */
export function mintClientId(now: number = Date.now()): string {
  const random = Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)
  return `${random}.${Math.floor(now / 1000)}`
}

/**
 * Pulls the GA4 client id out of a `_ga` cookie (`GA1.1.1234567890.1699999999`).
 *
 * The two leading fields are a version and the same subdomain index Meta uses;
 * only the last two are the id. Returns null for anything that does not have
 * them, so a malformed cookie falls through to our own id rather than sending
 * GA4 something it will reject.
 */
export function parseGaClientId(
  cookieValue: string | undefined
): string | null {
  if (!cookieValue) return null

  const parts = cookieValue.split('.')
  if (parts.length < 4) return null

  const clientId = parts.slice(-2).join('.')
  return /^\d+\.\d+$/.test(clientId) ? clientId : null
}

/**
 * The name of the per-stream session cookie gtag.js writes for a measurement
 * id: `G-ABC123DEF` becomes `_ga_ABC123DEF`.
 */
export function gaSessionCookieName(measurementId: string): string {
  return `_ga_${measurementId.replace(/^G-/, '')}`
}

/**
 * Pulls the session id out of `_ga_<stream>` (`GS1.1.1699999999.3.1.…`).
 *
 * Sending it is what lands a server-reported purchase in the session the buyer
 * was actually in. Without it GA4 opens a session of its own around the
 * conversion, and the report shows a purchase with no landing page, no source
 * and no preceding page views — the same sale, attributed to nothing.
 */
export function parseGaSessionId(
  cookieValue: string | undefined
): string | null {
  if (!cookieValue) return null

  const parts = cookieValue.split('.')
  // GS1.1.<sessionId>.… — third field. GS2 reorders nothing that matters here.
  const sessionId = parts[2]
  return sessionId && /^\d+$/.test(sessionId) ? sessionId : null
}

/**
 * Resolves the click id for a request.
 *
 * A click id in the URL wins over a stored one, because Meta attributes a
 * conversion to the *most recent* click and its own pixel overwrites `_fbc` on
 * every new `fbclid`. Preferring the cookie would mean a returning visitor who
 * clicks a second ad has their purchase credited to the first one forever —
 * quietly misreporting which campaign is working, which is the decision this
 * whole feature exists to inform.
 *
 * The cookie wins only when the URL has no click id, which is every request
 * after the landing one: the visitor who clicked an ad, browsed, and ordered
 * half an hour later is on a URL that carries nothing.
 *
 * Re-clicking the *same* ad keeps the stored value rather than re-minting it.
 * The timestamp in `_fbc` is when the click happened, and refreshing a page
 * that still has `fbclid` in its URL is not a new click.
 */
export function resolveFbc(
  storedFbc: string | undefined,
  fbclid: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (fbclid) {
    // `fb.1.<time>.<fbclid>` — the click id is everything after the third dot,
    // since Meta's ids may themselves contain dots.
    const storedClickId = storedFbc?.split('.').slice(3).join('.')
    if (storedFbc && storedClickId === fbclid) return storedFbc
    return formatFbc(fbclid, now)
  }

  return storedFbc ?? null
}
