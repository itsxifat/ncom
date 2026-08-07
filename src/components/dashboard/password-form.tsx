'use client'

import { useActionState } from 'react'
import { changePasswordAction } from '@/app/(dashboard)/account/actions'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PasswordForm() {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    undefined
  )

  return (
    <form action={action} key={state?.success}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        {state?.success && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {state.success}
          </p>
        )}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Changing…' : 'Change password'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
