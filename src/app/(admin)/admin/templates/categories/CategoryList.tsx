'use client'

import { useTransition } from 'react'
import { useActionState } from 'react'
import {
  createTemplateCategoryAction,
  toggleTemplateCategoryActiveAction,
  deleteTemplateCategoryAction,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'

interface Category {
  id: string
  name: string
  isActive: boolean
  _count: { templates: number }
}

export function CategoryList({ categories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState(
    createTemplateCategoryAction,
    undefined
  )
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex items-start gap-2">
        <FieldGroup className="flex-1">
          <Field>
            <div className="flex gap-2">
              <Input name="name" placeholder="New category name" required />
              <Button type="submit" disabled={pending}>
                {pending ? 'Adding…' : 'Add category'}
              </Button>
            </div>
            {state?.error && <FieldError>{state.error}</FieldError>}
          </Field>
        </FieldGroup>
      </form>

      <div className="divide-border divide-y rounded-lg border">
        {categories.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            No categories yet.
          </p>
        )}
        {categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{category.name}</span>
              <Badge variant={category.isActive ? 'default' : 'secondary'}>
                {category.isActive ? 'Active' : 'Hidden'}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {category._count.templates}{' '}
                {category._count.templates === 1 ? 'template' : 'templates'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(() =>
                    toggleTemplateCategoryActiveAction(category.id)
                  )
                }
              >
                {category.isActive ? 'Hide' : 'Unhide'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete "${category.name}"? Templates in it become uncategorized.`
                    )
                  ) {
                    return
                  }
                  startTransition(() =>
                    deleteTemplateCategoryAction(category.id)
                  )
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
