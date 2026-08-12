import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { isCertifiableHostname } from '@/server/services/domainService'

/**
 * The gate Caddy's on-demand TLS asks before ordering a certificate.
 *
 * Caddy issues `GET /api/internal/tls-check?key=<secret>&domain=<hostname>` during
 * the TLS handshake for a name it holds no certificate for, and treats any 2xx as
 * "go ahead". That makes this the only thing standing between the deployment and
 * an ACME order for every hostname a stranger points at this IP — see
 * `isCertifiableHostname`, which is where the decision actually lives.
 *
 * Two properties this endpoint has to keep:
 *
 *  - **It fails closed.** No `TLS_CHECK_SECRET`, no certificates. A misconfigured
 *    deploy that answered 200 to everything would look completely healthy right up
 *    until the rate limit is exhausted and no tenant can onboard for a week.
 *
 *  - **It is fast.** This runs inside a TLS handshake, so a slow answer is a slow
 *    (or failed) page load for a real visitor. One indexed lookup, no DNS.
 *
 * The secret rides in the query string because Caddy's `ask` cannot send headers.
 * It only has to be unguessable — the endpoint is bound to loopback, and the
 * secret keeps a request that arrives through the public proxy from probing which
 * domains exist.
 */

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.TLS_CHECK_SECRET
  if (!secret) return false

  const a = Buffer.from(request.nextUrl.searchParams.get('key') ?? '')
  const b = Buffer.from(secret)
  // Length first: timingSafeEqual throws on a mismatch, and the length of a
  // secret is not the secret.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse(null, { status: 404 })
  }

  const domain = request.nextUrl.searchParams.get('domain')
  if (!domain) {
    return new NextResponse(null, { status: 400 })
  }

  const allowed = await isCertifiableHostname(domain)
  // Caddy reads the status only. A body would be logged on every handshake for
  // no benefit.
  return new NextResponse(null, { status: allowed ? 200 : 403 })
}
