'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { loginAction } from '@/app/(auth)/actions'
import { GoogleSignInButton } from '@/components/app/google-sign-in-button'
import {
  AuthHeader,
  Field,
  FormAlert,
  OrDivider,
  PasswordInput,
  SubmitButton,
  TextInput,
} from '@/components/auth/auth-ui'

export function LoginForm({
  googleEnabled,
  registrationOpen,
  callbackUrl,
  justReset,
}: {
  googleEnabled: boolean
  registrationOpen: boolean
  callbackUrl?: string
  /** Arrived from a password reset that could not sign them in itself. */
  justReset?: boolean
}) {
  const [state, action, pending] = useActionState(loginAction, undefined)
  // Held here rather than left to the form: a failed sign-in must not clear
  // what was typed (React resets uncontrolled fields after every action).
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Someone sent here from an invitation link usually has no account yet, so
  // the hop to /register has to carry the invitation with it.
  const registerHref = callbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/register'
  const forgotHref = email
    ? `/forgot-password?email=${encodeURIComponent(email)}`
    : '/forgot-password'

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        title="Welcome back"
        subtitle="Sign in to your pages, stores and orders."
      />

      <div className="au-rise-2 flex flex-col gap-6">
        {googleEnabled && (
          <>
            <GoogleSignInButton
              label="Continue with Google"
              callbackUrl={callbackUrl}
              className="h-12 rounded-xl text-[15px]"
            />
            <OrDivider />
          </>
        )}

        <form action={action} className="flex flex-col gap-5">
          {callbackUrl && (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          )}
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@business.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(state?.error) || undefined}
              required
              autoFocus
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            aside={
              <Link
                href={forgotHref}
                className="text-muted-foreground hover:text-foreground text-[13px] font-medium underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            }
          >
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(state?.error) || undefined}
              required
            />
          </Field>

          {state?.error && <FormAlert>{state.error}</FormAlert>}
          {!state?.error && (state?.notice || justReset) && (
            <FormAlert tone="success">
              {state?.notice ??
                'Your password has been changed. Sign in with the new one.'}
            </FormAlert>
          )}

          <SubmitButton pending={pending} pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      </div>

      {registrationOpen && (
        <p className="au-rise-3 text-muted-foreground text-center text-sm">
          New to NCOM?{' '}
          <Link
            href={registerHref}
            className="text-foreground font-semibold underline-offset-4 hover:underline"
          >
            Start your 7-day free trial
          </Link>
        </p>
      )}
    </div>
  )
}
