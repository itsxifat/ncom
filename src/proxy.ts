import NextAuth from 'next-auth'
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server'
import { authConfig } from '@/server/auth/auth.config'
import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (always Node.js runtime).
const { auth } = NextAuth(authConfig)

// `auth`'s declared type is a union of very different call shapes (plain
// middleware, wrapped middleware, API routes, getServerSideProps...) that
// TypeScript can't discriminate through a rest-tuple union — this pins
// down the one overload actually used below (calling `auth(req, event)`
// directly takes the same code path as `export default auth`).
const authMiddleware = auth as unknown as (
  request: NextRequest,
  event: NextFetchEvent
) => Promise<Response>

const ROOT_HOSTNAME = (process.env.ROOT_DOMAIN ?? 'localhost:3000').split(
  ':'
)[0]

/** `{sub}.${ROOT_DOMAIN}` -> `sub`, or null if this host isn't a tenant subdomain. */
function extractTenantSubdomain(host: string): string | null {
  const hostname = host.split(':')[0]
  if (!hostname || hostname === ROOT_HOSTNAME) return null
  if (!hostname.endsWith(`.${ROOT_HOSTNAME}`)) return null

  const subdomain = hostname.slice(0, -(ROOT_HOSTNAME.length + 1))
  if (!subdomain || subdomain.includes('.')) return null
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null

  return subdomain
}

/**
 * Tenant subdomains are rewritten straight to the public site renderer,
 * bypassing auth entirely (those pages are public). Everything else keeps
 * going through NextAuth's own request handling — calling `auth(req, event)`
 * directly (rather than the `auth((req) => ...)` wrapper form) takes the
 * exact same code path Next.js takes when `auth` is used as the bare
 * default export, so the existing `authorized()` gating and redirect
 * behavior is unchanged for dashboard/admin routes.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const host = request.headers.get('host') ?? ''
  const subdomain = extractTenantSubdomain(host)

  if (subdomain) {
    const url = request.nextUrl.clone()
    url.pathname = `/sites/${subdomain}${request.nextUrl.pathname}`
    return NextResponse.rewrite(url)
  }

  return authMiddleware(request, event)
}

// sitemap.xml/robots.txt are NOT excluded here (unlike the usual Next.js
// convention) — a tenant subdomain request to either must still be rewritten
// to that tenant's own sitemap/robots route, not fall through to NCOM's own
// app/sitemap.ts. On the root domain they're harmless: authorized() doesn't
// treat them as protected routes, so they pass through unchanged.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
