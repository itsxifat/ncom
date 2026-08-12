'use client'

import { useActionState } from 'react'
import {
  updateOrganizationAction,
  type OrgActionState,
} from '@/app/(dashboard)/organization/actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function OrganizationForm({
  name,
  canEdit,
}: {
  name: string
  canEdit: boolean
}) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(
    updateOrganizationAction,
    undefined
  )

  return (
    <Card>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Workspace name</FieldLabel>
              <Input
                id="name"
                name="name"
                defaultValue={name}
                disabled={!canEdit}
                required
              />
            </Field>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}
            {canEdit && (
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save'}
                </Button>
              </Field>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
