import type { NextRequest } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { MAX_FAMILIES, googleFontStylesheet } from '@/server/fonts/stylesheet'

/**
 * GET /api/fonts/css?family=Lexend&family=Galada[&text=…]
 *
 * The stylesheet for the Google Fonts families a page uses beyond the
 * self-hosted catalogue — the URL `fontStylesheetHref` (lib/fonts.ts) builds,
 * linked from every page that uses one. The rules come from Google once and
 * are cached; the font files they point at are served by ./file, on this same
 * origin, so the storefront's CSP stays at 'self' and a shopper's browser
 * never talks to Google.
 *
 * A page must never break because of a font, so every answer is a valid
 * stylesheet: an unknown family is left out, and if Google cannot be reached
 * the families it could not supply are left out too and the browser is told
 * to ask again soon. The page then simply sets its fallback face.
 *
 * Public and unauthenticated, so it is rate limited per address, twice. Every
 * request counts against a generous limit, because a shopper's page view
 * costs one and a phone network's shoppers often share an address. Each
 * family that has to be fetched from Google counts against a tighter one, so
 * a single request naming many families, or a stream of made-up specimens,
 * which are never cached, cannot make us fetch on someone else's behalf.
 */

const IP_LIMIT = 600
const IP_WINDOW_SECONDS = 60

/**
 * Families fetched from Google per address per minute. A page's families come
 * from the cache after the first visitor, so this is spent almost entirely by
 * the font picker, one family for each a merchant scrolls past; two a second
 * is more than anyone looks at.
 */
const GOOGLE_FETCH_LIMIT = 120

/** The same request gets the same rules for days; a day keeps font updates flowing. */
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'

/** A family Google could not supply just now: ask again soon rather than in a day. */
const RETRY_SOON = 'public, max-age=60'
const RETRY_SOON_HERE = 'private, max-age=60'

export async function GET(request: NextRequest) {
  const ip = await getClientIp()
  const limit = await checkRateLimit(
    `fonts-css:${ip}`,
    IP_LIMIT,
    IP_WINDOW_SECONDS
  )
  if (!limit.allowed) {
    return stylesheet('', 429, 'no-store', {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  const params = request.nextUrl.searchParams
  // Specimens (the picker's text= requests) draw on their own allowance, so a
  // merchant scrolling the font list cannot use up what the pages on the same
  // address — their own storefront in the next tab — need to load their fonts.
  const kind = params.get('text') ? 'specimen' : 'page'
  const fetches = { refused: false }
  const { css, complete } = await googleFontStylesheet(
    params.getAll('family').slice(0, MAX_FAMILIES),
    params.get('text'),
    async () => {
      const { allowed } = await checkRateLimit(
        `fonts-css-google:${kind}:${ip}`,
        GOOGLE_FETCH_LIMIT,
        IP_WINDOW_SECONDS
      )
      if (!allowed) fetches.refused = true
      return allowed
    }
  )
  // A family left out because this address hit its limit says nothing about
  // the family, so a shared cache must not hand that gap to anyone else.
  const retry = fetches.refused ? RETRY_SOON_HERE : RETRY_SOON
  return stylesheet(css, 200, complete ? CACHE_CONTROL : retry)
}

function stylesheet(
  css: string,
  status: number,
  cacheControl: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(css, {
    status,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': cacheControl,
      ...headers,
    },
  })
}

export const runtime = 'nodejs'
