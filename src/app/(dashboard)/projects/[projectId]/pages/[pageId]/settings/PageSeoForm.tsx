'use client'

import { useActionState } from 'react'
import { updatePageSeoAction } from './actions'
import { OgImagePicker } from '@/components/dashboard/og-image-picker'
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

export function PageSeoForm({
  projectId,
  pageId,
  title,
  slug,
  isHome,
  seoTitle,
  seoDescription,
  robotsIndex,
  ogImageMediaId,
  ogImageUrl,
}: {
  projectId: string
  pageId: string
  title: string
  slug: string
  isHome: boolean
  seoTitle: string | null
  seoDescription: string | null
  robotsIndex: boolean
  ogImageMediaId: string | null
  ogImageUrl: string | null
}) {
  const boundAction = updatePageSeoAction.bind(null, projectId, pageId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="title">Page title</FieldLabel>
          <Input id="title" name="title" defaultValue={title} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="slug">URL slug</FieldLabel>
          <Input id="slug" name="slug" defaultValue={slug} required />
          {isHome && (
            <FieldDescription>
              This is your home page — it&apos;s always served at the root URL,
              regardless of this slug.
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="seoTitle">SEO title</FieldLabel>
          <Input
            id="seoTitle"
            name="seoTitle"
            defaultValue={seoTitle ?? ''}
            placeholder={title}
          />
          <FieldDescription>
            Falls back to the page title if left blank.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="seoDescription">SEO description</FieldLabel>
          <Textarea
            id="seoDescription"
            name="seoDescription"
            defaultValue={seoDescription ?? ''}
            rows={3}
          />
        </Field>
        <Field>
          <FieldLabel>Social share image</FieldLabel>
          <OgImagePicker
            name="ogImageMediaId"
            mediaId={ogImageMediaId ?? undefined}
            initialUrl={ogImageUrl ?? undefined}
          />
        </Field>
        <Field orientation="horizontal">
          <input
            type="checkbox"
            id="robotsIndex"
            name="robotsIndex"
            defaultChecked={robotsIndex}
            className="size-4"
          />
          <FieldLabel htmlFor="robotsIndex">
            Allow search engines to index this page
          </FieldLabel>
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        {state?.success && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {state.success}
          </p>
        )}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save SEO settings'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
