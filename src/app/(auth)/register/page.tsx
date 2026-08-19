import { redirect } from 'next/navigation'
import { isGoogleAuthConfigured } from '@/server/auth/auth'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { safeCallbackPath } from '@/lib/auth-redirect'
import { RegisterForm } from './RegisterForm'

export default async function RegisterPage({
  searchParams,
}: PageProps<'/register'>) {
  // Closing sign-ups has to close the page, not just hide the link to it.
  if (!(await getPlatformFlag('auth.allowSelfRegistration'))) redirect('/login')

  const googleEnabled =
    isGoogleAuthConfigured && (await getPlatformFlag('auth.googleLoginEnabled'))

  const { callbackUrl } = await searchParams

  return (
    <RegisterForm
      googleEnabled={googleEnabled}
      callbackUrl={callbackUrl ? safeCallbackPath(callbackUrl) : undefined}
    />
  )
}
