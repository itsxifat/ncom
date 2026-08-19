'use client'

import { useActionState } from 'react'
import { googleSignInAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'

/**
 * The Google mark, inline.
 *
 * Inlined rather than fetched: the CSP in next.config.ts allows images from
 * `https:` but a remote logo on the login screen is a third-party request on the
 * most security-sensitive page in the app, and Google's brand guidelines require
 * the four-colour mark be reproduced exactly — which an inline path guarantees.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

export function GoogleSignInButton({
  label,
  callbackUrl,
}: {
  label: string
  callbackUrl?: string
}) {
  const [state, action, pending] = useActionState(googleSignInAction, undefined)

  return (
    <form action={action} className="flex flex-col gap-2">
      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="w-full"
      >
        <GoogleMark />
        {pending ? 'Redirecting…' : label}
      </Button>
      {state?.error && <FieldError>{state.error}</FieldError>}
    </form>
  )
}

/** "or" rule between the OAuth button and the password form. */
export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs">or</span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}
