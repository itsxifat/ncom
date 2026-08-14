import { NextResponse } from 'next/server'

/**
 * Anything under `/api/v1` that no real route matched.
 *
 * Without this, a mistyped or retired path falls through to the web app's
 * own 404 — an HTML page. Every client here is told to call `response.json()`,
 * including the examples in our documentation, so a typo surfaces as a JSON
 * parse error rather than a 404, and an integrator debugging it concludes the
 * transport is broken rather than that they mis-spelled a word.
 *
 * Next matches concrete segments before an optional catch-all, so every real
 * endpoint still wins; this only ever sees paths nothing else claimed.
 *
 * Deliberately unauthenticated. The path does not exist for anyone, so asking
 * for a key first would answer a different question than the one being asked —
 * and returning 401 for a typo sends people to check their credentials.
 */
function notFound(request: Request) {
  const { pathname } = new URL(request.url)

  return NextResponse.json(
    {
      error: {
        code: 'not_found',
        message: `No such endpoint: ${request.method} ${pathname}. See the API reference at /docs.`,
      },
    },
    { status: 404 }
  )
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const HEAD = notFound
export const OPTIONS = notFound

export const runtime = 'nodejs'
