'use client'

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react'
import { MailCheck } from 'lucide-react'
import {
  resendVerificationCodeAction,
  verifyEmailAction,
} from '@/app/(auth)/actions'
import { signOutAction } from '@/app/(dashboard)/actions'
import {
  AuthHeader,
  CodeInput,
  FormAlert,
  StepIndicator,
  SubmitButton,
} from '@/components/auth/auth-ui'

/** How long before "send a new code" can be pressed again. */
const RESEND_AFTER_S = 45

export function VerifyEmailForm({
  email,
  mailerConfigured,
  callbackUrl,
  steps,
}: {
  email: string
  mailerConfigured: boolean
  callbackUrl?: string
  steps: string[] | null
}) {
  const [state, action, pending] = useActionState(verifyEmailAction, undefined)
  // Not `useActionState`: the resend needs its own trigger, and a second form
  // nested inside the verify form is invalid HTML.
  const [resendState, setResendState] = useState<{
    error?: string
    notice?: string
  }>({})
  const [resending, startResend] = useTransition()
  const [wait, setWait] = useState(RESEND_AFTER_S)
  const formRef = useRef<HTMLFormElement>(null)
  // A fresh set of boxes after a wrong code, so the next try starts clean.
  const [attempt, setAttempt] = useState(0)
  const [lastError, setLastError] = useState<string | undefined>()

  if (state?.error !== lastError) {
    setLastError(state?.error)
    if (state?.error) setAttempt((n) => n + 1)
  }

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  const stepIndex = steps?.indexOf('Confirm email') ?? -1

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        icon={<MailCheck className="size-5" />}
        title="Check your inbox"
        subtitle={
          <>
            We sent a 6-digit code to{' '}
            <span className="text-foreground font-semibold">{email}</span>.
            Enter it below — it works for 10 minutes.
          </>
        }
      >
        {steps && stepIndex >= 0 && (
          <StepIndicator steps={steps} current={stepIndex} className="mb-3" />
        )}
      </AuthHeader>

      <form
        ref={formRef}
        action={action}
        className="au-rise-2 flex flex-col gap-5"
      >
        {callbackUrl && (
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
        )}
        <CodeInput
          key={attempt}
          name="code"
          disabled={pending}
          invalid={Boolean(state?.error)}
          onComplete={() => formRef.current?.requestSubmit()}
        />

        {state?.error && <FormAlert>{state.error}</FormAlert>}
        {resendState.error && <FormAlert>{resendState.error}</FormAlert>}
        {resendState.notice && !state?.error && (
          <FormAlert tone="success">{resendState.notice}</FormAlert>
        )}
        {!mailerConfigured && (
          <FormAlert>
            No mail server is set up on this platform yet, so codes can’t be
            sent. Contact your administrator.
          </FormAlert>
        )}

        <SubmitButton pending={pending} pendingLabel="Checking…">
          Confirm email
        </SubmitButton>
      </form>

      <div className="au-rise-3 flex flex-col items-center gap-3 text-sm">
        <p className="text-muted-foreground">
          Didn’t get it? Check spam, or{' '}
          <button
            type="button"
            disabled={resending || !mailerConfigured || wait > 0}
            onClick={() =>
              startResend(async () => {
                const result = (await resendVerificationCodeAction()) ?? {}
                setResendState(result)
                if (!result.error) setWait(RESEND_AFTER_S)
              })
            }
            className="text-foreground font-semibold underline-offset-4 hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-60"
          >
            {resending
              ? 'sending…'
              : wait > 0
                ? `send a new code in ${wait}s`
                : 'send a new code'}
          </button>
        </p>

        <form action={signOutAction}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground text-[13px] underline-offset-4 hover:underline"
          >
            Wrong address? Sign out and start again
          </button>
        </form>
      </div>
    </div>
  )
}
