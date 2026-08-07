'use client'

import { use, useActionState } from 'react'
import { createPageAction } from '@/app/(dashboard)/projects/actions'
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

export default function NewPagePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const boundAction = createPageAction.bind(null, projectId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold">
            New page
          </CardTitle>
          <CardDescription>
            Add a page to this project. You&apos;ll be able to add sections once
            the visual builder is available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="title">Page title</FieldLabel>
                <Input
                  id="title"
                  name="title"
                  placeholder="About us"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="slug">URL slug (optional)</FieldLabel>
                <Input id="slug" name="slug" placeholder="about" />
                <FieldDescription>
                  Leave blank to generate one from the title.
                </FieldDescription>
              </Field>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Creating…' : 'Create page'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
