import { redirect } from 'next/navigation'
import { auth } from '@/server/auth/auth'
import { prisma } from '@/server/db/client'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { isEmailConfigured } from '@/server/services/emailService'
import { VerifyEmailForm } from './VerifyEmailForm'

export const metadata = { title: 'Confirm your email' }

export default async function VerifyEmailPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  })

  // Already done, or the platform does not ask for it — either way there is
  // nothing to do here, and leaving the screen reachable would strand anyone who
  // bookmarked it.
  if (user?.emailVerified) redirect('/dashboard')
  if (!(await getPlatformFlag('auth.requireEmailVerification'))) {
    redirect('/dashboard')
  }

  return (
    <VerifyEmailForm
      email={session.user.email}
      mailerConfigured={await isEmailConfigured('EMAIL_VERIFICATION')}
    />
  )
}
