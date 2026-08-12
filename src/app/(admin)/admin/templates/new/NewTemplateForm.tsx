'use client'

import { useActionState } from 'react'
import { createTemplateAction } from '../actions'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/ui/form-select'

export function NewTemplateForm({
  categories,
}: {
  categories: { id: string; name: string }[]
}) {
  const [state, action, pending] = useActionState(
    createTemplateAction,
    undefined
  )

  return (
    <div className="mx-auto w-full max-w-lg py-4 sm:py-10">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold tracking-tight">
            New template
          </CardTitle>
          <CardDescription>
            Starts as a draft — build its sections, then publish it so tenants
            can pick it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Template name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="SaaS launch"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <FormSelect id="categoryId" name="categoryId" defaultValue="">
                  <option value="">Uncategorized</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </FormSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="description">
                  Description (optional)
                </FieldLabel>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="A clean landing page for SaaS products."
                />
                <FieldDescription>
                  Shown to tenants browsing the template gallery.
                </FieldDescription>
              </Field>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Creating…' : 'Create template'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
