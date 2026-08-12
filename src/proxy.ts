import NextAuth from 'next-auth'
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server'
import { authConfig } from '@/server/auth/auth.config'
import { tenantSubdomain } from '@/lib/tenant-host'
import { encodeDomainHandle, isCandidateCustomDomain } from '@/lib/site-handle'

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

const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? 'localhost:3000'

/** `{sub}.${ROOT_DOMAIN}` -> `sub`, or null if this host isn't a tenant subdomain. */
function extractTenantSubdomain(host: string): string | null {
  return tenantSubdomain(host, ROOT_DOMAIN)
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

  // A host that is neither ours nor a tenant subdomain is a tenant's own custom
  // domain. The hostname is passed through in the same route slot rather than
  // resolved here: this function runs on every request and must not read the
  // database (see the note above), so `resolveSiteHandle` does the lookup inside
  // the route, where it can be cached.
  if (
    !subdomain &&
    isCandidateCustomDomain(host) &&
    !request.nextUrl.pathname.startsWith('/api/')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = `/sites/${encodeDomainHandle(host.split(':')[0]!)}${request.nextUrl.pathname}`
    return NextResponse.rewrite(url)
  }

  // API routes are global: they live at /api/* for every host and identify the
  // tenant from their own payload, not from the URL. Rewriting them under
  // /sites/{subdomain} pointed them at routes that do not exist, so a
  // storefront's own fetch to /api/storefront/orders came back as a 404 HTML
  // page — the client then failed parsing it as JSON and reported "Could not
  // reach the store", which looked like the backend was disconnected.
  //
  // Server actions are unaffected either way: they post to the current path
  // and are dispatched by action id, so the rewritten /sites/* route handles
  // them correctly. Only real /api/* routes need to escape the rewrite.
  if (subdomain && !request.nextUrl.pathname.startsWith('/api/')) {
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
