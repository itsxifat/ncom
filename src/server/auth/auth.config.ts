import type { NextAuthConfig } from 'next-auth'

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

      const isProtected =
        nextUrl.pathname.startsWith('/dashboard') ||
        nextUrl.pathname.startsWith('/stores') ||
        nextUrl.pathname.startsWith('/templates') ||
        nextUrl.pathname.startsWith('/account') ||
        nextUrl.pathname.startsWith('/preview-render') ||
        nextUrl.pathname.startsWith('/builder-canvas')

      if (isProtected) {
        return isLoggedIn
      }
      return true
    },
  },
} satisfies NextAuthConfig
