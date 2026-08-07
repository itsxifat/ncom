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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected =
        nextUrl.pathname.startsWith('/dashboard') ||
        nextUrl.pathname.startsWith('/projects') ||
        nextUrl.pathname.startsWith('/templates') ||
        nextUrl.pathname.startsWith('/account') ||
        nextUrl.pathname.startsWith('/admin') ||
        nextUrl.pathname.startsWith('/preview-render')

      if (isProtected) {
        return isLoggedIn
      }
      return true
    },
  },
} satisfies NextAuthConfig
