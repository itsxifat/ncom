import { NextResponse, type NextRequest } from 'next/server'
import {
  FALLBACK_CLIENT_ID_COOKIE,
  FBC_COOKIE,
  FBP_COOKIE,
  attributionCookieOptions,
  mintClientId,
  mintFbp,
  resolveFbc,
} from './identity'

/**
 * Captures ad-click attribution on the storefront request itself.
 *
 * This runs in `proxy.ts`, which is the only place in the request lifecycle
 * that can both read the incoming URL and write a cookie. That matters more
 * than it sounds: `fbclid` is present on exactly one request — the ad click —
 * and a Server Component cannot set cookies, so anywhere later is too late.
 * Miss it and every sale from that visit is unattributable, which is the one
 * failure this whole feature exists to prevent.
 *
 * The values are handed to the render twice over. As `Set-Cookie`, so they
 * survive to the order submission minutes later; and as request headers, so the
 * page rendering *this* request already sees them — a cookie set on a response
 * is not readable by the render that produced it, and the landing view is
 * precisely the event that carries the click id.
 *
 * Those headers are always overwritten, never merged. They are internal, and a
 * request that arrives from the internet already carrying `x-ncom-fbc` is
 * someone trying to write their own click id into a merchant's ad reporting.
 */

export const FBP_HEADER = 'x-ncom-fbp'
export const FBC_HEADER = 'x-ncom-fbc'
export const CLIENT_ID_HEADER = 'x-ncom-cid'

interface ResolvedAttribution {
  fbp: string
  fbc: string | null
  clientId: string
  /** Only what was missing — an existing cookie is never rewritten. */
  toSet: { name: string; value: string }[]
}

/**
 * Reads the visitor's identifiers, minting whichever are absent.
 *
 * Existing cookies always win. `_fbp` and the fallback client id identify a
 * returning visitor, and re-minting either on every request would turn one
 * person into a new person per page view — inflating reach and destroying the
 * repeat-purchase view a merchant judges their ads by.
 */
function resolveAttribution(request: NextRequest): ResolvedAttribution {
  const now = Date.now()
  const toSet: { name: string; value: string }[] = []

  const existingFbp = request.cookies.get(FBP_COOKIE)?.value
  const fbp = existingFbp ?? mintFbp(now)
  if (!existingFbp) toSet.push({ name: FBP_COOKIE, value: fbp })

  const existingFbc = request.cookies.get(FBC_COOKIE)?.value
  const fbc = resolveFbc(
    existingFbc,
    request.nextUrl.searchParams.get('fbclid'),
    now
  )
  // A later click on a different ad replaces the stored one: the most recent
  // click is the one Meta attributes the conversion to.
  if (fbc && fbc !== existingFbc) toSet.push({ name: FBC_COOKIE, value: fbc })

  const existingClientId = request.cookies.get(FALLBACK_CLIENT_ID_COOKIE)?.value
  const clientId = existingClientId ?? mintClientId(now)
  if (!existingClientId) {
    toSet.push({ name: FALLBACK_CLIENT_ID_COOKIE, value: clientId })
  }

  return { fbp, fbc, clientId, toSet }
}

/**
 * Whether this request is a page a person is about to look at.
 *
 * Attribution belongs on navigations, not on the image and font requests that
 * follow one. Skipping those keeps `Set-Cookie` off responses that a CDN would
 * otherwise refuse to cache.
 */
function isDocumentRequest(request: NextRequest): boolean {
  return (request.headers.get('accept') ?? '').includes('text/html')
}

/**
 * Rewrites to the storefront renderer, carrying attribution with it.
 *
 * Every storefront request goes through here rather than a bare
 * `NextResponse.rewrite`, so there is no route into a tenant page that quietly
 * skips the capture.
 */
export function rewriteWithAttribution(
  request: NextRequest,
  url: URL
): NextResponse {
  if (!isDocumentRequest(request)) {
    return NextResponse.rewrite(url)
  }

  const { fbp, fbc, clientId, toSet } = resolveAttribution(request)

  const headers = new Headers(request.headers)
  headers.set(FBP_HEADER, fbp)
  headers.set(CLIENT_ID_HEADER, clientId)
  if (fbc) headers.set(FBC_HEADER, fbc)
  else headers.delete(FBC_HEADER)

  const response = NextResponse.rewrite(url, { request: { headers } })
  for (const cookie of toSet) {
    response.cookies.set(cookie.name, cookie.value, attributionCookieOptions)
  }

  return response
}
