import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
import { authConfig } from './auth.config'
import { loginSchema } from '@/lib/validation/auth'
import { DUMMY_BCRYPT_HASH } from '@/lib/security'
import {
  claimFirstAdmin,
  provisionPersonalWorkspace,
} from '@/server/services/authService'

/**
 * Google is configured only when both credentials are present.
 *
 * Auth.js throws at import time on a provider with a missing client id, which
 * would take down every route including the credentials login. A platform that
 * has not set up OAuth yet should simply not offer the button — the admin flag
 * `auth.googleLoginEnabled` controls whether it is *shown*, this controls
 * whether it can work at all.
 */
const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
)

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const user = await prisma.user.findUnique({ where: { email } })

        // Always run bcrypt.compare, even when the user doesn't exist, so
        // this takes the same time either way — otherwise the "no such
        // user" path returns measurably faster than "wrong password" and
        // lets an attacker enumerate registered emails via response timing.
        const isValidPassword = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_BCRYPT_HASH
        )

        if (!user || !user.passwordHash || user.isSuspended) return null
        if (!isValidPassword) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          platformRole: user.platformRole,
        }
      },
    }),
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // Linking by email is safe *because* Google asserts whether the
            // address is verified, and the profile mapping below refuses to
            // record verification when it does not. Without linking, anyone who
            // registered with a password and later clicks "Continue with
            // Google" gets OAuthAccountNotLinked and no way forward.
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
                // Google has already done what our OTP flow does, so a Google
                // signup must not be sent to the verify screen. Trust it only
                // when Google actually says the address is verified.
                emailVerified: profile.email_verified ? new Date() : null,
                platformRole: 'USER' as const,
              }
            },
          }),
        ]
      : []),
  ],
  events: {
    /**
     * Fires when the adapter creates a user — i.e. a Google signup, since
     * credentials users are created by `registerUser`, which provisions its own
     * workspace inside its transaction.
     *
     * A failure here would leave a user with no organisation, so it is logged
     * loudly: `getActiveOrganization` redirects a membership-less user back to
     * /login, which looks like a broken sign-in button rather than a data
     * problem.
     */
    async createUser({ user }) {
      if (!user.id) return

      const existing = await prisma.membership.count({
        where: { userId: user.id },
      })
      if (existing > 0) return

      try {
        await prisma.$transaction(async (tx) => {
          await provisionPersonalWorkspace(tx, {
            userId: user.id!,
            displayName: user.name ?? user.email?.split('@')[0] ?? 'My',
          })

          // A Google signup can claim the administrator seat too — otherwise the
          // bootstrap would be bypassable in the other direction: an operator who
          // only offers Google sign-in would have no way to get a first admin.
          // Same guards apply, including ADMIN_BOOTSTRAP_EMAIL.
          if (user.email) {
            await claimFirstAdmin(tx, { userId: user.id!, email: user.email })
          }
        })
      } catch (error) {
        console.error('Failed to provision workspace for new user:', error)
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * A suspended account must not be able to sign in through OAuth either.
     * The credentials provider checks `isSuspended` in `authorize`; Google never
     * reaches that code, so the check lives here as well.
     */
    async signIn({ user }) {
      if (!user.email) return true

      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { isSuspended: true },
      })
      return !existing?.isSuspended
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string
        token.platformRole = user.platformRole
      }
      if (trigger === 'update' && session?.name) {
        token.name = session.name as string
      }
      return token
    },
  },
})

export const isGoogleAuthConfigured = googleConfigured
