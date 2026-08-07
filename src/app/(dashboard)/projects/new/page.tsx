'use client'

import { useActionState } from 'react'
import { createProjectAction } from '@/app/(dashboard)/projects/actions'
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

export default function NewProjectPage() {
  const [state, action, pending] = useActionState(
    createProjectAction,
    undefined
  )

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold">
            New project
          </CardTitle>
          <CardDescription>
            Give your landing page project a name. You can pick a template once
            it&apos;s created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Project name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="Acme Launch Page"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subdomain">
                  Subdomain (optional)
                </FieldLabel>
                <Input id="subdomain" name="subdomain" placeholder="acme" />
                <FieldDescription>
                  Leave blank to generate one from the project name. Your page
                  will be reachable at <code>subdomain.ncom.app</code>.
                </FieldDescription>
              </Field>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Creating…' : 'Create project'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
