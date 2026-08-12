'use client'

import { useActionState, useState, useTransition } from 'react'
import { Code2 } from 'lucide-react'
import {
  publishTemplateAction,
  saveTemplateAction,
} from '@/app/(dashboard)/stores/[storeId]/theme/templates/actions'
import type { StoreActionState } from '@/app/(dashboard)/commerce-actions'
import { Card, CardContent } from '@/components/ui/card'
import { FieldDescription, FieldError, FieldGroup } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * A plain monospace textarea rather than a full code editor.
 *
 * CodeMirror or Monaco would add roughly a megabyte to a route most merchants
 * open rarely, and neither ships Liquid highlighting without further plugins.
 * What actually prevents mistakes here is server-side validation: every save
 * parses the template through the real engine and reports the failing line, so
 * a syntax error cannot reach a draft, let alone the storefront. Syntax
 * colouring is a genuine improvement to make later, not a correctness gap.
 */
function CodeArea({
  name,
  defaultValue,
  rows = 20,
}: {
  name: string
  defaultValue: string
  rows?: number
}) {
  return (
    <textarea
      name={name}
      defaultValue={defaultValue}
      rows={rows}
      spellCheck={false}
      // Tabs and quotes must survive typing — autocorrect on a phone will
      // otherwise turn "value" into "value" and break the parse.
      autoCapitalize="off"
      autoCorrect="off"
      className={cn(
        'border-input bg-card w-full rounded-lg border p-3',
        'font-mono text-[13px] leading-relaxed',
        'focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3'
      )}
    />
  )
}

const TEMPLATE_LABELS: Record<string, string> = {
  PRODUCT: 'Product page',
  COLLECTION: 'Collection page',
  COLLECTION_LIST: 'All collections',
  CART: 'Cart page',
  SEARCH: 'Search results',
  CUSTOMER_ACCOUNT: 'Customer account',
  CUSTOMER_LOGIN: 'Customer login',
  ORDER_STATUS: 'Order status',
  NOT_FOUND: 'Not found (404)',
}

export interface TemplateView {
  id: string
  type: string
  source: string
  publishedSource: string | null
}

export function TemplateEditor({
  storeId,
  template,
}: {
  storeId: string
  template: TemplateView
}) {
  const bound = saveTemplateAction.bind(null, storeId, template.id)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    bound,
    undefined
  )
  const [publishing, startTransition] = useTransition()
  const [publishState, setPublishState] = useState<StoreActionState>(undefined)

  const isLive = template.publishedSource !== null
  const hasUnpublished = isLive && template.publishedSource !== template.source

  return (
    <Card>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Code2 className="size-4.5" />
                {TEMPLATE_LABELS[template.type] ?? template.type}
              </h3>
              <div className="flex items-center gap-2">
                {!isLive && <Badge variant="outline">Not published</Badge>}
                {hasUnpublished && (
                  <Badge variant="secondary">Unpublished changes</Badge>
                )}
                {isLive && !hasUnpublished && (
                  <Badge variant="lime">Live</Badge>
                )}
              </div>
            </div>

            {!isLive && (
              <FieldDescription>
                Until you publish this, the storefront uses the built-in layout.
              </FieldDescription>
            )}

            <CodeArea name="source" defaultValue={template.source} />

            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}
            {publishState?.error && (
              <FieldError>{publishState.error}</FieldError>
            )}
            {publishState?.success && (
              <p className="text-muted-foreground text-sm">
                {publishState.success}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                type="button"
                disabled={publishing}
                onClick={() =>
                  startTransition(async () => {
                    setPublishState(
                      await publishTemplateAction(storeId, template.id)
                    )
                  })
                }
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export interface SectionView {
  id: string
  name: string
  key: string
  category: string
  liquidSource: string | null
}
