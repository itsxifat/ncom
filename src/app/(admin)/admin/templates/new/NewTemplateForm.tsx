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
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold">
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
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue=""
                  className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
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
