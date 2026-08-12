'use client'

import { useActionState, useState } from 'react'
import { Code2 } from 'lucide-react'
import type { ImportState } from '@/app/(dashboard)/stores/[storeId]/pages/[pageId]/edit/import-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'

const EXAMPLE = `{% section 'hero' %}
  <h1>{{ section.settings.heading }}</h1>
  <p>{{ section.settings.subheading }}</p>
  {% schema %}
  { "name": "Hero", "settings": [
      { "type": "text", "id": "heading", "label": "Heading", "default": "Big sale" },
      { "type": "text", "id": "subheading", "label": "Subheading" }
  ]}
  {% endschema %}
{% endsection %}

{% section 'promo' %}
  <div>{{ section.settings.body }}</div>
  {% schema %}
  { "name": "Promo", "settings": [
      { "type": "richtext", "id": "body", "label": "Body" }
  ]}
  {% endschema %}
{% endsection %}`

/**
 * Paste-Liquid-to-layers, from inside the page editor.
 *
 * Deliberately lives in the builder rather than a separate code area: the
 * output is builder layers, so this is a way of *starting* a page, not a
 * parallel authoring mode. After importing, everything is edited the normal
 * way — drag to reorder, click to edit settings, hide or duplicate.
 */
export function ImportLiquidDialog({
  action,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    action,
    undefined
  )
  const [source, setSource] = useState('')

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Code2 className="size-4" />
        Paste Liquid
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Build this page from Liquid</DialogTitle>
        <DialogDescription>
          Each {'{% section %}'} becomes its own layer you can reorder and edit
          afterwards — exactly like sections added from the palette.
        </DialogDescription>

        <form action={formAction} className="mt-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="source">Liquid</FieldLabel>
              <textarea
                id="source"
                name="source"
                rows={18}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={EXAMPLE}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-3"
              />
              <FieldDescription>
                A {'{% schema %}'} block is optional. Without one, every
                heading, paragraph, button label, image, link and colour in your
                markup is detected and given its own control in the sidebar — so
                nothing you paste ends up locked. A document with no{' '}
                {'{% section %}'} wrappers is imported as a single layer.
              </FieldDescription>
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="replace"
                defaultChecked
                className="size-4"
              />
              Replace the sections already on this page
            </label>

            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-sm text-green-600 dark:text-green-500">
                {state.success}
              </p>
            )}

            <Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? 'Importing…' : 'Import as layers'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSource(EXAMPLE)}
                >
                  Use example
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
