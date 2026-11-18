'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { ArrowLeft, KeyRound } from 'lucide-react'
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from '@/app/(auth)/actions'
import {
  AuthHeader,
  CodeInput,
  Field,
  FormAlert,
  PasswordInput,
  PasswordRules,
  SubmitButton,
  TextInput,
  passwordMeetsRules,
} from '@/components/auth/auth-ui'

/**
 * Two steps on one screen: the address, then the emailed code and a new
 * password. Finishing signs the person straight in.
 */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [requested, request, requesting] = useActionState(
    requestPasswordResetAction,
    undefined
  )
  const [reset, submitReset, resetting] = useActionState(
    resetPasswordAction,
    undefined
  )
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [editing, setEditing] = useState(false)

  const onCodeStep =
    !editing && (requested?.stage === 'code' || reset?.stage === 'code')
  const sentTo = reset?.email ?? requested?.email ?? email

  if (onCodeStep) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeader
          icon={<KeyRound className="size-5" />}
          title="Set a new password"
          subtitle={
            <>
              Enter the 6-digit code we sent to{' '}
              <span className="text-foreground font-semibold">{sentTo}</span>,
              then choose a new password.
            </>
          }
        />
        <form action={submitReset} className="au-rise-2 flex flex-col gap-5">
          <input type="hidden" name="email" value={sentTo} />
          <Field label="Code from the email" htmlFor="code-0">
            <CodeInput
              id="code-0"
              name="code"
              disabled={resetting}
              invalid={Boolean(reset?.error)}
              onChange={setCode}
            />
          </Field>
          <Field label="New password" htmlFor="password">
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="Make a new password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <PasswordRules value={password} />
          </Field>

          {reset?.error ? (
            <FormAlert>{reset.error}</FormAlert>
          ) : (
            requested?.notice && (
              <FormAlert tone="success">{requested.notice}</FormAlert>
            )
          )}

          <SubmitButton
            pending={resetting}
            pendingLabel="Saving…"
            disabled={code.length < 6 || !passwordMeetsRules(password)}
          >
            Save and sign in
          </SubmitButton>
        </form>
        <div className="au-rise-3 flex flex-col items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground font-medium underline-offset-4 hover:underline"
          >
            Use a different email, or send the code again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        icon={<KeyRound className="size-5" />}
        title="Forgot your password?"
        subtitle="Enter the email you sign in with and we’ll send you a 6-digit code to set a new one."
      />
      <form
        action={(formData) => {
          setEditing(false)
          request(formData)
        }}
        className="au-rise-2 flex flex-col gap-5"
      >
        <Field label="Email" htmlFor="email">
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </Field>
        {requested?.error && <FormAlert>{requested.error}</FormAlert>}
        <SubmitButton pending={requesting} pendingLabel="Sending the code…">
          Send me a code
        </SubmitButton>
      </form>
      <Link
        href="/login"
        className="au-rise-3 text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-4" />
        Back to sign in
      </Link>
    </div>
  )
}
