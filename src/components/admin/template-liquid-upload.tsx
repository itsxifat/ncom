'use client'

import { useActionState } from 'react'
import { UploadCloud } from 'lucide-react'
import {
  importTemplateLiquidAction,
  type TemplateUploadState,
} from '@/app/(admin)/admin/templates/actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const PLACEHOLDER = `{% section 'hero' %}
  <h1>{{ section.settings.heading }}</h1>
  {% schema %}
  { "name": "Hero", "settings": [
      { "type": "text", "id": "heading", "label": "Heading", "default": "Big sale" }
  ]}
  {% endschema %}
{% endsection %}

{% section 'features' %}
  ...
{% endsection %}`

/**
 * Admin import for a whole-page Liquid design.
 *
 * The document is split into layers on import — one per `{% section %}` — so
 * the result is the same editable component stack a designer would have built
 * by hand, not a frozen blob. Merchants can then reorder, hide, duplicate and
 * edit each layer in the builder exactly as they would a built-in section.
 *
 * Paste rather than file upload: themes arrive as a snippet from a designer or
 * an AI far more often than as a file, and a paste box works in both cases.
 */
export function TemplateLiquidUpload({
  templateId,
  source,
}: {
  templateId: string
  source: string | null
}) {
  const bound = importTemplateLiquidAction.bind(null, templateId)
  const [state, action, pending] = useActionState<
    TemplateUploadState,
    FormData
  >(bound, undefined)

  return (
    <Card>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold tracking-tight">
                <UploadCloud className="size-4.5" />
                Liquid design
              </h3>
              {source && <Badge variant="lime">Uploaded</Badge>}
            </div>

            <Field>
              <FieldLabel htmlFor="source">Template source</FieldLabel>
              <textarea
                id="source"
                name="source"
                rows={24}
                defaultValue={source ?? ''}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={PLACEHOLDER}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-3"
              />
              <FieldDescription>
                Wrap each part of the page in{' '}
                {"{% section 'name' %} … {% endsection %}"} — every one becomes
                a separate layer merchants can reorder and edit. Give each a{' '}
                {'{% schema %}'} block to define its editable settings.
                Importing replaces the template&rsquo;s existing layers.
              </FieldDescription>
            </Field>

            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}

            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? 'Importing…' : 'Import design'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
