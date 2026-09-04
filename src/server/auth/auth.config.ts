import type { NextAuthConfig } from 'next-auth'

/**
 * Every route that renders inside the dashboard layout, plus the two headless
 * render routes the builder loads in an iframe.
 *
 * This list has to hold every one of them. The layout resolves the active
 * organisation, which *throws* on an anonymous request rather than redirecting,
 * so a route missing here does not degrade to a login prompt — it 500s into the
 * error boundary. It had drifted badly: only four of the sixteen dashboard
 * routes were listed, so signing out and opening /analytics, /orders, /products
 * or nine others gave an error page instead of the sign-in screen. /invitations
 * was the case that first exposed it, being the one dashboard URL routinely
 * opened by someone who is not signed in and often has no account yet.
 *
 * Matched on segment boundaries rather than as bare prefixes, so a future public
 * route like /account-deleted cannot be swallowed by the /account entry.
 *
 * Keep in step with `src/app/(dashboard)/`.
 */
const PROTECTED_PREFIXES = [
  '/account',
  '/analytics',
  '/billing',
  '/builder-canvas',
  '/categories',
  '/collections',
  '/customers',
  '/dashboard',
  '/discounts',
  '/inventory',
  '/invitations',
  '/labels',
  '/media',
  '/orders',
  '/organization',
  '/preview-render',
  // Parcel stickers and invoices. Chrome-free and outside the dashboard
  // layout, which is exactly why it has to be listed here — nothing else on
  // that route would send a signed-out visitor to the login page, and the
  // ids in its query string address other people's customers.
  '/print',
  '/products',
  '/scan',
  '/settings',
  '/stores',
  // Note this does NOT gate `/track/<token>`, the customer's own delivery page.
  // The prefix test is an exact match or a `/`-delimited descendant, so
  // `/tracking` and `/track/abc` are unrelated paths — which is what lets the
  // merchant's log be private while the buyer's link stays open to someone who
  // has no account here at all.
  '/tracking',
]

/**
 * Lightweight subset used by `proxy.ts` for optimistic, cookie-only route
 * guarding. No Credentials provider and no Prisma adapter here — proxy runs
 * on every request (including prefetches), so it must only decode the JWT
 * from the cookie, never hit the database.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    // Shared with the full auth.ts instance (via `...authConfig.callbacks`)
    // so both copies of NextAuth expose platformRole on `session.user` —
    // without this, the lightweight instance falls back to NextAuth's
    // default session callback, which drops custom JWT claims, and the
    // `authorized` role check below would silently always fail.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.platformRole = token.platformRole
      }
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user

      // Role check happens here too (not just in requirePlatformAdmin on the
      // server) so a non-admin never even reaches an admin route's render
      // path — this is optimistic (role comes from the JWT, not a fresh DB
      // read) so server-side requirePlatformAdmin remains the source of truth.
      if (nextUrl.pathname.startsWith('/admin')) {
        return isLoggedIn && auth?.user?.platformRole === 'SUPER_ADMIN'
      }

      const isProtected = PROTECTED_PREFIXES.some(
        (prefix) =>
          nextUrl.pathname === prefix ||
          nextUrl.pathname.startsWith(`${prefix}/`)
      )

      if (isProtected) {
        return isLoggedIn
      }
      return true
    },
  },
} satisfies NextAuthConfig
