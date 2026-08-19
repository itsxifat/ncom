import { isGoogleAuthConfigured } from '@/server/auth/auth'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { safeCallbackPath } from '@/lib/auth-redirect'
import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Both have to be true: the platform owner has to want the button, and the
  // OAuth credentials have to exist for it to do anything.
  const googleEnabled =
    isGoogleAuthConfigured && (await getPlatformFlag('auth.googleLoginEnabled'))

  // Sanitised here as well as in the action: this value is rendered into the
  // page and into a link, so it should never have been anything but one of our
  // own paths by the time it gets that far.
  const { callbackUrl } = await searchParams

  return (
    <LoginForm
      googleEnabled={googleEnabled}
      registrationOpen={await getPlatformFlag('auth.allowSelfRegistration')}
      callbackUrl={callbackUrl ? safeCallbackPath(callbackUrl) : undefined}
    />
  )
}
