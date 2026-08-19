'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { loginAction } from '@/app/(auth)/actions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  AuthDivider,
  GoogleSignInButton,
} from '@/components/app/google-sign-in-button'

export function LoginForm({
  googleEnabled,
  registrationOpen,
  callbackUrl,
}: {
  googleEnabled: boolean
  registrationOpen: boolean
  callbackUrl?: string
}) {
  const [state, action, pending] = useActionState(loginAction, undefined)

  // Someone sent here from an invitation link usually has no account yet, so
  // the hop to /register has to carry the invitation with it.
  const registerHref = callbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/register'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl font-semibold">
          Sign in
        </CardTitle>
        <CardDescription>
          Welcome back. Sign in to keep working on your landing pages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {googleEnabled && (
          <>
            <GoogleSignInButton
              label="Continue with Google"
              callbackUrl={callbackUrl}
            />
            <AuthDivider />
          </>
        )}

        <form action={action}>
          {callbackUrl && (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.notice && (
              <p className="text-sm text-emerald-600">{state.notice}</p>
            )}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        {registrationOpen && (
          <p className="text-muted-foreground mt-6 text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link
              href={registerHref}
              className="text-foreground underline underline-offset-4"
            >
              Create one
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
