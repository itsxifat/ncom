'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import {
  createPageAction,
  createPageFromTemplateAction,
} from '@/app/(dashboard)/stores/actions'
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

export function NewPageForm({
  storeId,
  templateId,
  templateName,
}: {
  storeId: string
  templateId?: string
  templateName?: string
}) {
  const boundAction = templateId
    ? createPageFromTemplateAction.bind(null, storeId, templateId)
    : createPageAction.bind(null, storeId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <div className="mx-auto w-full max-w-lg py-4 sm:py-10">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold tracking-tight">
            New page
          </CardTitle>
          <CardDescription>
            {templateName ? (
              <>
                Starting from the <strong>{templateName}</strong> template.
              </>
            ) : (
              <>
                Add a blank page, or{' '}
                <Link
                  href={`/templates?forStore=${storeId}`}
                  className="text-foreground underline"
                >
                  start from a template
                </Link>
                .
              </>
            )}
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
