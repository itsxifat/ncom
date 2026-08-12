'use client'

import { useActionState, useState, useTransition } from 'react'
import { MailCheck } from 'lucide-react'
import {
  resendVerificationCodeAction,
  verifyEmailAction,
} from '@/app/(auth)/actions'
import { signOutAction } from '@/app/(dashboard)/actions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function VerifyEmailForm({
  email,
  mailerConfigured,
}: {
  email: string
  mailerConfigured: boolean
}) {
  const [state, action, pending] = useActionState(verifyEmailAction, undefined)
  // Not `useActionState`: the resend needs its own trigger, and a second form
  // nested inside the verify form is invalid HTML.
  const [resendState, setResendState] = useState<{
    error?: string
    notice?: string
  }>({})
  const [resending, startResend] = useTransition()

  return (
    <Card>
      <CardHeader>
        <div className="bg-lime text-lime-foreground mb-4 flex size-11 items-center justify-center rounded-full">
          <MailCheck className="size-5" />
        </div>
        <CardTitle className="font-display text-2xl font-semibold">
          Confirm your email
        </CardTitle>
        <CardDescription>
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to
          finish setting up your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="code">Verification code</FieldLabel>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                // 7 rather than 6: a browser that trims the value on paste
                // should not silently drop a digit before validation sees it.
                maxLength={7}
                placeholder="123456"
                className="text-center font-mono text-lg tracking-[0.3em]"
                autoFocus
                required
              />
              <FieldDescription>
                The code expires 10 minutes after it was sent.
              </FieldDescription>
            </Field>

            {state?.error && <FieldError>{state.error}</FieldError>}
            {resendState.error && <FieldError>{resendState.error}</FieldError>}
            {resendState.notice && (
              <p className="text-sm text-emerald-600">{resendState.notice}</p>
            )}

            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? 'Checking…' : 'Confirm email'}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-center text-sm">
          <p className="text-muted-foreground">
            Didn&apos;t get it? Check spam, then{' '}
            <button
              type="button"
              disabled={resending || !mailerConfigured}
              onClick={() =>
                startResend(async () => {
                  setResendState((await resendVerificationCodeAction()) ?? {})
                })
              }
              className="text-foreground underline underline-offset-4 disabled:opacity-50"
            >
              {resending ? 'sending…' : 'send a new code'}
            </button>
            .
          </p>

          {!mailerConfigured && (
            <p className="text-destructive text-xs">
              No mail server is configured on this platform yet, so codes cannot
              be sent. Contact your administrator.
            </p>
          )}

          <form action={signOutAction}>
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
            >
              Sign out and use a different account
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
