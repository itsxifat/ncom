'use client'

import { useActionState } from 'react'
import { updateTemplateMetaAction } from './actions'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export function TemplateMetaForm({
  templateId,
  name,
  description,
  categoryId,
  status,
  categories,
}: {
  templateId: string
  name: string
  description: string | null
  categoryId: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  categories: { id: string; name: string }[]
}) {
  const boundAction = updateTemplateMetaAction.bind(null, templateId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Template name</FieldLabel>
          <Input id="name" name="name" defaultValue={name} required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="categoryId">Category</FieldLabel>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={categoryId ?? ''}
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
            <FieldLabel htmlFor="status">Status</FieldLabel>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            defaultValue={description ?? ''}
          />
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save details'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
