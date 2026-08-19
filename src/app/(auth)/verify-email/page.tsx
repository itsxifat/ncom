import { redirect } from 'next/navigation'
import { auth } from '@/server/auth/auth'
import { prisma } from '@/server/db/client'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { isEmailConfigured } from '@/server/services/emailService'
import { safeCallbackPath } from '@/lib/auth-redirect'
import { VerifyEmailForm } from './VerifyEmailForm'

export const metadata = { title: 'Confirm your email' }

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<'/verify-email'>) {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  })

  // Signup parks the post-signup destination here so confirming an address
  // does not lose it — an invitee who registers to accept an invitation should
  // land back on that invitation, not on an empty dashboard.
  const { callbackUrl } = await searchParams
  const destination = safeCallbackPath(callbackUrl)

  // Already done, or the platform does not ask for it — either way there is
  // nothing to do here, and leaving the screen reachable would strand anyone who
  // bookmarked it.
  if (user?.emailVerified) redirect(destination)
  if (!(await getPlatformFlag('auth.requireEmailVerification'))) {
    redirect(destination)
  }

  return (
    <VerifyEmailForm
      email={session.user.email}
      mailerConfigured={await isEmailConfigured('EMAIL_VERIFICATION')}
      callbackUrl={callbackUrl ? destination : undefined}
    />
  )
}
