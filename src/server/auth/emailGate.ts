import 'server-only'
import { redirect } from 'next/navigation'
import { prisma } from '@/server/db/client'
import { getPlatformFlag } from '@/server/services/platformFlagService'

/**
 * Holds an unverified account at the verification screen.
 *
 * Read from the database rather than the JWT on purpose. The session token is
 * issued at sign-in and lives for days; a user who verifies their address would
 * keep being bounced back here until it refreshed. A single indexed lookup per
 * dashboard layout render is a fair price for the gate being correct the instant
 * verification completes.
 *
 * Called from the dashboard and admin layouts, which every protected route
 * renders through — so there is no protected surface that skips it.
 */
export async function requireVerifiedEmail(userId: string): Promise<void> {
  if (!(await getPlatformFlag('auth.requireEmailVerification'))) return

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  })

  if (user && user.emailVerified === null) {
    redirect('/verify-email')
  }
}
