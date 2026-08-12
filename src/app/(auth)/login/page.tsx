import { isGoogleAuthConfigured } from '@/server/auth/auth'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  // Both have to be true: the platform owner has to want the button, and the
  // OAuth credentials have to exist for it to do anything.
  const googleEnabled =
    isGoogleAuthConfigured && (await getPlatformFlag('auth.googleLoginEnabled'))

  return (
    <LoginForm
      googleEnabled={googleEnabled}
      registrationOpen={await getPlatformFlag('auth.allowSelfRegistration')}
    />
  )
}
