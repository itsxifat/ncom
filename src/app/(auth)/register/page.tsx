import { redirect } from 'next/navigation'
import { isGoogleAuthConfigured } from '@/server/auth/auth'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { emailStepRequired } from '@/server/onboarding'
import { safeCallbackPath } from '@/lib/auth-redirect'
import { signupSteps } from '@/lib/onboarding'
import { RegisterForm } from './RegisterForm'

export const metadata = { title: 'Start your free trial' }

export default async function RegisterPage({
  searchParams,
}: PageProps<'/register'>) {
  // Closing sign-ups has to close the page, not just hide the link to it.
  if (!(await getPlatformFlag('auth.allowSelfRegistration'))) redirect('/login')

  const googleEnabled =
    isGoogleAuthConfigured && (await getPlatformFlag('auth.googleLoginEnabled'))

  const { callbackUrl } = await searchParams
  const callback = callbackUrl ? safeCallbackPath(callbackUrl) : undefined

  return (
    <RegisterForm
      googleEnabled={googleEnabled}
      callbackUrl={callback}
      // Someone signing up to accept an invitation joins that workspace; the
      // onboarding steps are for people starting their own.
      steps={callback ? null : signupSteps(await emailStepRequired())}
    />
  )
}
