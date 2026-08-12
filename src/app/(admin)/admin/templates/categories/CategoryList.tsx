'use client'

import { useTransition } from 'react'
import { useActionState } from 'react'
import { Plus, Tags } from 'lucide-react'
import {
  createTemplateCategoryAction,
  toggleTemplateCategoryActiveAction,
  deleteTemplateCategoryAction,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'

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
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input name="name" placeholder="New category name" required />
                  <Button type="submit" disabled={pending}>
                    <Plus />
                    {pending ? 'Adding…' : 'Add category'}
                  </Button>
                </div>
                {state?.error && <FieldError>{state.error}</FieldError>}
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Add one above to start grouping the template gallery."
        />
      ) : (
        <ListPanel>
          {categories.map((category) => (
            <ListRow key={category.id}>
              <ListRowText
                title={category.name}
                meta={`${category._count.templates} ${category._count.templates === 1 ? 'template' : 'templates'}`}
                badges={
                  <Badge variant={category.isActive ? 'lime' : 'secondary'}>
                    {category.isActive ? 'Active' : 'Hidden'}
                  </Badge>
                }
              />
              <ListRowActions>
                <Button
                  type="button"
                  variant="outline"
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
                  variant="destructive"
                  size="sm"
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
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
