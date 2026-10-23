import type { NextRequest } from 'next/server'
import {
  checkRateLimit,
  getClientIp,
  type RateLimitResult,
} from '@/lib/rate-limit'
import { fontFileSource, getFontFile } from '@/server/fonts/files'

/**
 * GET /api/fonts/file/s/<family>/<version>/<file>.woff2
 * GET /api/fonts/file/l/font?kit=…&skey=…&v=…
 *
 * The font files a proxied Google Fonts stylesheet (../css) points at, served
 * from our own origin. Each is fetched from fonts.gstatic.com once per server
 * and kept on disk (server/fonts/files.ts), except the font picker's
 * specimens; only files our stylesheets point at are accepted, and nothing but
 * that one host is ever fetched.
 *
 * A file at a given address never changes — Google puts the font's version in
 * the path — so it is cached for a year.
 *
 * No Access-Control-Allow-Origin header, on purpose. Every page that uses
 * these files links the stylesheet by a relative address, so its fonts load
 * from that page's own host — a tenant subdomain, a custom domain, the
 * builder — and need no CORS. A browser loads a font from another site only
 * with CORS, so leaving the header out is what stops other websites using
 * NCOM as a free font CDN at our expense, one visitor's address at a time.
 *
 * Rate limited per address, generously: one page view loads a handful of
 * files (Latin, Bangla, a weight or two) and a phone network's shoppers often
 * share an address. Files served from disk cost Google nothing, so fetches
 * from Google are counted on their own, more tightly: that is what stops a
 * stream of never-seen files, or of specimens, which are never kept, being
 * pulled through us.
 */

const IP_LIMIT = 3000
const IP_WINDOW_SECONDS = 60

/**
 * Files fetched from Google per address per minute. A page using a family
 * this server has not served before needs a dozen or so, and the font picker
 * one per family a merchant scrolls past.
 */
const GOOGLE_FETCH_LIMIT = 300

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const ip = await getClientIp()
  const limit = await checkRateLimit(
    `fonts-file:${ip}`,
    IP_LIMIT,
    IP_WINDOW_SECONDS
  )
  if (!limit.allowed) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSeconds) },
    })
  }

  const { path } = await params
  const source = await fontFileSource(path, request.nextUrl.searchParams)
  if (!source) return new Response(null, { status: 404 })

  // Asked only when the file has to come from Google.
  const fetches: { limit?: RateLimitResult } = {}
  const file = await getFontFile(source, async () => {
    fetches.limit = await checkRateLimit(
      `fonts-file-google:${ip}`,
      GOOGLE_FETCH_LIMIT,
      IP_WINDOW_SECONDS
    )
    return fetches.limit.allowed
  })
  if (!file && fetches.limit?.allowed === false) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(fetches.limit.retryAfterSeconds) },
    })
  }
  if (!file) {
    return new Response(null, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

export const runtime = 'nodejs'
