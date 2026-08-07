'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { updateProfileAction } from '@/app/(dashboard)/account/actions'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(
    updateProfileAction,
    undefined
  )
  const { update } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (state?.success && state.name) {
      update({ name: state.name }).then(() => router.refresh())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success, state?.name])

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" defaultValue={name} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" defaultValue={email} disabled />
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        {state?.success && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {state.success}
          </p>
        )}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
