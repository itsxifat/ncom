import NextAuth from 'next-auth'
import { authConfig } from '@/server/auth/auth.config'

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (always Node.js runtime).
// This performs an optimistic, cookie-only auth check (via authConfig's
// `authorized` callback) to redirect signed-out users away from protected
// routes. It is not the source of truth for authorization — every server
// action and route handler re-checks access via `rbac.ts`.
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth).*)',
  ],
}
