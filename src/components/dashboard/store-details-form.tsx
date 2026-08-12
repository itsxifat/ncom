'use client'

import { useActionState } from 'react'
import { updateStoreAction } from '@/app/(dashboard)/stores/actions'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function StoreDetailsForm({
  storeId,
  name,
  subdomain,
  rootDomain,
}: {
  storeId: string
  name: string
  subdomain: string
  /** `env.ROOT_DOMAIN`, passed in because `env` is server-only. */
  rootDomain: string
}) {
  const boundAction = updateStoreAction.bind(null, storeId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Store name</FieldLabel>
          <Input id="name" name="name" defaultValue={name} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="subdomain">Subdomain</FieldLabel>
          <Input
            id="subdomain"
            name="subdomain"
            defaultValue={subdomain}
            required
          />
          <FieldDescription>
            Your page is reachable at{' '}
            <code>
              {subdomain}.{rootDomain}
            </code>
            . Changing this will break any existing links.
          </FieldDescription>
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
