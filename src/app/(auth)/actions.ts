'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn, auth } from '@/server/auth/auth'
import { prisma } from '@/server/db/client'
import {
  loginSchema,
  otpCodeSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from '@/lib/validation/auth'
import {
  registerUser,
  setPasswordByEmail,
  EmailAlreadyInUseError,
} from '@/server/services/authService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isEmailConfigured } from '@/server/services/emailService'
import { OtpError, issueOtp, verifyOtp } from '@/server/services/otpService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { safeCallbackPath } from '@/lib/auth-redirect'

export type AuthActionState = { error?: string; notice?: string } | undefined

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`login:${ip}`, 10, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again in a few minutes.' }
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    purpose: formData.get('purpose') || undefined,
  })

  if (!parsed.success) {
    return { error: 'Enter a valid email and password.' }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      // Whatever they were trying to reach before the auth gate stopped them,
      // rather than always the dashboard. An invitation link that dumps its
      // recipient on a dashboard has not been accepted — it has been lost.
      redirectTo: safeCallbackPath(formData.get('callbackUrl')),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Invalid email or password.' }
    }
    throw error
  }
}

/**
 * Starts a Google sign-in.
 *
 * A server action rather than a link so the provider check and the flag live on
 * the server: a hidden button is not a control, and `signIn` needs to run
 * server-side anyway to set up the OAuth state cookie.
 */
export async function googleSignInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!(await getPlatformFlag('auth.googleLoginEnabled'))) {
    return { error: 'Google sign-in is turned off on this platform.' }
  }

  // `signIn` redirects by throwing, so anything after it never runs.
  await signIn('google', {
    redirectTo: safeCallbackPath(formData.get('callbackUrl')),
  })
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`register:${ip}`, 5, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again in a few minutes.' }
  }

  if (!(await getPlatformFlag('auth.allowSelfRegistration'))) {
    return {
      error: 'Sign-ups are closed right now. Ask your team for an invitation.',
    }
  }

  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    purpose: formData.get('purpose') || undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? 'Check your details and try again.' }
  }

  let isFirstAdmin = false
  try {
    ;({ isFirstAdmin } = await registerUser(parsed.data))
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      return { error: error.message }
    }
    throw error
  }

  const verificationRequired = await shouldVerify(parsed.data.email)

  if (verificationRequired) {
    try {
      await issueOtp({
        email: parsed.data.email,
        purpose: 'EMAIL_VERIFICATION',
      })
    } catch (error) {
      // The account exists and the password works, so signing in and landing on
      // the verify screen with a "resend" button is a better outcome than
      // discarding the registration over a transient SMTP failure.
      console.error('Could not send verification code at signup:', error)
    }
  }

  // The account that claimed the administrator seat lands in the admin panel,
  // so a fresh install's first act is obvious rather than something to go
  // looking for. Everyone else carries on into onboarding — their business,
  // then a package. An explicit callback outranks both: someone who got here
  // from an invitation link came to join a workspace.
  const destination = safeCallbackPath(
    formData.get('callbackUrl'),
    isFirstAdmin ? '/admin' : '/onboarding'
  )

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      // Verification still comes first when it is required — carrying the
      // destination across, so confirming an address does not strand a brand
      // new invitee away from the invitation that brought them here.
      redirectTo: verificationRequired
        ? `/verify-email?callbackUrl=${encodeURIComponent(destination)}`
        : destination,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { notice: 'Account created — please sign in.' }
    }
    throw error
  }
}

/**
 * Whether this signup has to confirm its address.
 *
 * No, when the platform has turned verification off — and also no when no SMTP
 * server is configured for verification mail. A platform with no mailer cannot
 * verify anybody, and the honest choice there is to let people in rather than
 * locking every new account out of a product they just signed up for. The
 * address is marked verified so the gate does not strand them later, once a
 * mail server does get configured.
 */
async function shouldVerify(email: string): Promise<boolean> {
  if (!(await getPlatformFlag('auth.requireEmailVerification'))) {
    await markVerified(email)
    return false
  }

  if (!(await isEmailConfigured('EMAIL_VERIFICATION'))) {
    console.warn(
      'Email verification is required but no SMTP server is configured — auto-verifying signup.'
    )
    await markVerified(email)
    return false
  }

  return true
}

async function markVerified(email: string): Promise<void> {
  await prisma.user.updateMany({
    where: { email, emailVerified: null },
    data: { emailVerified: new Date() },
  })
}

export async function verifyEmailAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`verify-email:${ip}`, 20, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again in a few minutes.' }
  }

  const parsed = otpCodeSchema.safeParse({ code: formData.get('code') })
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.',
    }
  }

  try {
    await verifyOtp({
      email: session.user.email,
      purpose: 'EMAIL_VERIFICATION',
      code: parsed.data.code,
    })
  } catch (error) {
    if (error instanceof OtpError) return { error: error.message }
    throw error
  }

  // Keyed on the session's user id, not the code's, so a verified code can only
  // ever mark the account that is signed in.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { emailVerified: new Date() },
  })

  redirect(safeCallbackPath(formData.get('callbackUrl')))
}

export async function resendVerificationCodeAction(): Promise<AuthActionState> {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`resend-otp:${ip}`, 5, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many requests. Wait a few minutes and try again.' }
  }

  try {
    await issueOtp({
      email: session.user.email,
      purpose: 'EMAIL_VERIFICATION',
      userId: session.user.id,
    })
  } catch (error) {
    if (error instanceof OtpError) return { error: error.message }
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not send the code. Try again shortly.',
    }
  }

  return { notice: 'A new code is on its way.' }
}

export type PasswordResetState =
  | { error?: string; notice?: string; stage?: 'code'; email?: string }
  | undefined

/**
 * Sends a password-reset code. The answer is the same whether or not an
 * account uses the address, so this cannot be used to find out who has one.
 */
export async function requestPasswordResetAction(
  _prevState: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`reset-request:${ip}`, 5, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many requests. Wait a few minutes and try again.' }
  }

  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter your email.' }
  }
  const email = parsed.data.email

  if (!(await isEmailConfigured('PASSWORD_RESET'))) {
    return {
      error:
        'Password reset emails aren’t set up on this platform yet. Contact us and we’ll help you back in.',
    }
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, isSuspended: true },
  })

  if (user && !user.isSuspended) {
    try {
      await issueOtp({ email, purpose: 'PASSWORD_RESET', userId: user.id })
    } catch (error) {
      if (error instanceof OtpError) return { error: error.message }
      console.error('Could not send a password reset code:', error)
      return { error: 'Could not send the code. Try again shortly.' }
    }
  }

  return {
    stage: 'code',
    email,
    notice: 'If an account uses this address, a 6-digit code is on its way.',
  }
}

/** Checks the emailed code, sets the new password and signs the person in. */
export async function resetPasswordAction(
  _prevState: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`reset:${ip}`, 20, 15 * 60)
  const email = String(formData.get('email') ?? '')
  if (!rateLimit.allowed) {
    return {
      stage: 'code',
      email,
      error: 'Too many attempts. Try again in a few minutes.',
    }
  }

  const parsed = passwordResetSchema.safeParse({
    email,
    code: formData.get('code'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return {
      stage: 'code',
      email,
      error: parsed.error.issues[0]?.message ?? 'Check the code and password.',
    }
  }

  try {
    await verifyOtp({
      email: parsed.data.email,
      purpose: 'PASSWORD_RESET',
      code: parsed.data.code,
    })
  } catch (error) {
    if (error instanceof OtpError) {
      return { stage: 'code', email, error: error.message }
    }
    throw error
  }

  const storedEmail = await setPasswordByEmail(
    parsed.data.email,
    parsed.data.password
  )
  if (!storedEmail) {
    return { stage: 'code', email, error: 'Request a new code to continue.' }
  }

  try {
    await signIn('credentials', {
      email: storedEmail,
      password: parsed.data.password,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      redirect('/login?reset=1')
    }
    throw error
  }
}
