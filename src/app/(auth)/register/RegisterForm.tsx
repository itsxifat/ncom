'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { registerAction } from '@/app/(auth)/actions'
import { GoogleSignInButton } from '@/components/app/google-sign-in-button'
import {
  AuthHeader,
  Field,
  FormAlert,
  OrDivider,
  PasswordInput,
  PasswordRules,
  StepIndicator,
  SubmitButton,
  TextInput,
} from '@/components/auth/auth-ui'

/**
 * The first step of signing up: just the account. What the business is and
 * which package it starts on come next, in /onboarding, one question at a
 * time.
 */
export function RegisterForm({
  googleEnabled,
  callbackUrl,
  steps,
}: {
  googleEnabled: boolean
  callbackUrl?: string
  /** The signup steps, or null when this sign-up is joining someone else's workspace. */
  steps: string[] | null
}) {
  const [state, action, pending] = useActionState(registerAction, undefined)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/login'

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        title={callbackUrl ? 'Create your account' : 'Start your free trial'}
        subtitle={
          callbackUrl
            ? 'Make an account to accept your invitation.'
            : '7 days free on any package. No payment needed, and it takes about two minutes.'
        }
      >
        {steps && <StepIndicator steps={steps} current={0} className="mb-3" />}
      </AuthHeader>

      <div className="au-rise-2 flex flex-col gap-6">
        {googleEnabled && (
          <>
            <GoogleSignInButton
              label="Sign up with Google"
              callbackUrl={callbackUrl ?? '/onboarding'}
              className="h-12 rounded-xl text-[15px]"
            />
            <OrDivider label="or sign up with email" />
          </>
        )}

        <form action={action} className="flex flex-col gap-5">
          {callbackUrl && (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          )}
          <Field label="Your name" htmlFor="name">
            <TextInput
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Your full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field
            label="Email"
            htmlFor="email"
            hint="We’ll send a 6-digit code here to confirm it’s yours."
          >
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@business.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="Make a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <PasswordRules value={password} />
          </Field>

          {state?.error && <FormAlert>{state.error}</FormAlert>}
          {state?.notice && (
            <FormAlert tone="success">{state.notice}</FormAlert>
          )}

          <SubmitButton pending={pending} pendingLabel="Creating your account…">
            Create account
          </SubmitButton>

          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            By creating an account you agree to the{' '}
            <Link href="/terms" className="hover:text-foreground underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="hover:text-foreground underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>

      <p className="au-rise-3 text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="text-foreground font-semibold underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
