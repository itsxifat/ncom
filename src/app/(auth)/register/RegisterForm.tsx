'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { registerAction } from '@/app/(auth)/actions'
import { SIGNUP_PURPOSES } from '@/lib/validation/auth'
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
import { FormSelect } from '@/components/store/form-controls'
import {
  AuthDivider,
  GoogleSignInButton,
} from '@/components/app/google-sign-in-button'

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(registerAction, undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl font-semibold">
          Create your account
        </CardTitle>
        <CardDescription>Open your online store on NCOM.</CardDescription>
      </CardHeader>
      <CardContent>
        {googleEnabled && (
          <>
            <GoogleSignInButton label="Sign up with Google" />
            <AuthDivider />
          </>
        )}

        <form action={action}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
              <FieldDescription>
                We&apos;ll send a 6-digit code here to confirm it&apos;s yours.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
              <FieldDescription>
                At least 8 characters, with a letter and a number.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="purpose">What brings you here?</FieldLabel>
              <FormSelect id="purpose" name="purpose" defaultValue="">
                <option value="">Prefer not to say</option>
                {SIGNUP_PURPOSES.map((purpose) => (
                  <option key={purpose.value} value={purpose.value}>
                    {purpose.label}
                  </option>
                ))}
              </FormSelect>
              <FieldDescription>
                Used to set up your first store — you can change anything later.
              </FieldDescription>
            </Field>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.notice && (
              <p className="text-sm text-emerald-600">{state.notice}</p>
            )}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? 'Creating account…' : 'Create account'}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
