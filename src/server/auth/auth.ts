import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
import { authConfig } from './auth.config'
import { loginSchema } from '@/lib/validation/auth'
import { DUMMY_BCRYPT_HASH } from '@/lib/security'

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
  ],
  callbacks: {
    ...authConfig.callbacks,
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
    async session({ session, token }) {
      session.user.id = token.id
      session.user.platformRole = token.platformRole
      return session
    },
  },
})
