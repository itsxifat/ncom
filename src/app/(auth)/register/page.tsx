import { redirect } from 'next/navigation'
import { isGoogleAuthConfigured } from '@/server/auth/auth'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { RegisterForm } from './RegisterForm'

export default async function RegisterPage() {
  // Closing sign-ups has to close the page, not just hide the link to it.
  if (!(await getPlatformFlag('auth.allowSelfRegistration'))) redirect('/login')

  const googleEnabled =
    isGoogleAuthConfigured && (await getPlatformFlag('auth.googleLoginEnabled'))

  return <RegisterForm googleEnabled={googleEnabled} />
}
