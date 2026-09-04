'use client'

import { useActionState, useMemo, useState } from 'react'
import { saveCategoryAction } from '@/app/(dashboard)/category-actions'
import type { StoreActionState } from '@/app/(dashboard)/commerce-actions'
import { Card, CardContent } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect } from '@/components/store/form-controls'
import { CATEGORY_LEVEL_LABELS } from '@/lib/validation/category'

export interface CategoryFormInitial {
  id?: string
  name: string
  handle: string
  parentId: string | null
  description: string
  code: string
  isActive: boolean
  isFeatured: boolean
  seoTitle: string
  seoDescription: string
}

export interface CategoryParentOption {
  id: string
  label: string
  level: number
}

export function CategoryForm({
  initial,
  parentOptions,
}: {
  initial: CategoryFormInitial
  /** Candidates for the parent select — already excludes this category's own subtree. */
  parentOptions: CategoryParentOption[]
}) {
  const boundAction = saveCategoryAction.bind(null, initial.id ?? null)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  const [name, setName] = useState(initial.name)
  const [handle, setHandle] = useState(initial.handle)
  const [parentId, setParentId] = useState(initial.parentId ?? '')
  const [description, setDescription] = useState(initial.description)
  const [code, setCode] = useState(initial.code)
  const [isActive, setIsActive] = useState(initial.isActive)
  const [isFeatured, setIsFeatured] = useState(initial.isFeatured)
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle)
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription)

  const payload = useMemo(
    () =>
      JSON.stringify({
        name,
        handle: handle || undefined,
        parentId: parentId || null,
        description,
        code,
        isActive,
        isFeatured,
        position: 0,
        seoTitle,
        seoDescription,
      }),
    [
      name,
      handle,
      parentId,
      description,
      code,
      isActive,
      isFeatured,
      seoTitle,
      seoDescription,
    ]
  )

  // A category three levels down cannot hold children, so those never appear as
  // a parent choice — offering them and then rejecting the save is a worse way
  // to teach the rule than not offering them.
  const selectableParents = parentOptions.filter(
    (option) => option.level < CATEGORY_LEVEL_LABELS.length - 1
  )

  const selectedParent = selectableParents.find(
    (option) => option.id === parentId
  )
  const level = selectedParent ? selectedParent.level + 1 : 0

  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />

      <SettingsSection
        title="Details"
        description="What this group is called and where it sits in the tree."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Womenswear"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="parentId">Sits under</FieldLabel>
            <FormSelect
              id="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Top level — a category of its own</option>
              {selectableParents.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </FormSelect>
            <FieldDescription>
              This will be a {CATEGORY_LEVEL_LABELS[level]?.toLowerCase()}.
              Categories go three levels deep: category → subcategory → child
              category.
            </FieldDescription>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="handle">URL handle</FieldLabel>
              <Input
                id="handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="Generated from the name"
              />
              <FieldDescription>
                Used in the storefront address for this category.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="code">Short code</FieldLabel>
              <Input
                id="code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="DRS"
                maxLength={12}
              />
              <FieldDescription>
                Optional. Appears in SKUs and exports, e.g. DRS-0042-M.
              </FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              Show on the storefront
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              Feature in navigation
            </label>
          </div>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="Search engine listing"
        description="How this category appears in search results."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="seoTitle">Page title</FieldLabel>
            <Input
              id="seoTitle"
              value={seoTitle}
              onChange={(event) => setSeoTitle(event.target.value)}
              placeholder={name || 'Defaults to the category name'}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="seoDescription">Meta description</FieldLabel>
            <Textarea
              id="seoDescription"
              rows={3}
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </SettingsSection>

      <Card>
        <CardContent>
          <FieldGroup>
            {state?.error && <FieldError>{state.error}</FieldError>}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : initial.id
                    ? 'Save category'
                    : 'Create category'}
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}
