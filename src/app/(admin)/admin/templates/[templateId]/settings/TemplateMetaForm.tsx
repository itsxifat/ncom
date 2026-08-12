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
  isPremium,
  categories,
}: {
  templateId: string
  name: string
  description: string | null
  categoryId: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  isPremium: boolean
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="categoryId">Category</FieldLabel>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={categoryId ?? ''}
              className="border-input bg-card h-10 rounded-[0.875rem] border px-3 text-sm"
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
              className="border-input bg-card h-10 rounded-[0.875rem] border px-3 text-sm"
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
        <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-xl p-2">
          <input
            type="checkbox"
            name="isPremium"
            defaultChecked={isPremium}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">Premium template</span>
            <span className="text-muted-foreground block text-xs">
              Only usable on plans that include premium templates. Tenants
              without that entitlement see it locked, and applying it is refused
              server-side.
            </span>
          </span>
        </label>
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
