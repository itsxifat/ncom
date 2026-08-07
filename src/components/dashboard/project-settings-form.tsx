'use client'

import { useActionState } from 'react'
import { updateProjectAction } from '@/app/(dashboard)/projects/actions'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProjectSettingsForm({
  projectId,
  name,
  subdomain,
}: {
  projectId: string
  name: string
  subdomain: string
}) {
  const boundAction = updateProjectAction.bind(null, projectId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Project name</FieldLabel>
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
            Your page is reachable at <code>{subdomain}.ncom.app</code>.
            Changing this will break any existing links.
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
