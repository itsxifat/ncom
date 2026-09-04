'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { setVariantStockAction } from '@/app/(dashboard)/commerce-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FieldLabel } from '@/components/ui/field'

/**
 * Stock for one variant, editable where the merchant is already looking.
 *
 * Stock changes on its own schedule — a delivery arrives, a shelf is counted —
 * and does not belong to the product form's save cycle. So this writes
 * immediately and separately: pressing Save on the product must not silently
 * re-apply a stock number that was typed ten minutes ago and has since been
 * overtaken by an order.
 *
 * Only rendered for a variant that already exists and tracks inventory. A
 * variant being created has no id to adjust yet, and an untracked one is
 * infinitely available and has nothing to count.
 */
export function VariantStockInput({
  variantId,
  initial,
}: {
  variantId: string
  initial: number
}) {
  const [value, setValue] = useState(String(initial))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty = value.trim() !== String(initial)

  function commit() {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a number of zero or more')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await setVariantStockAction(variantId, Math.round(parsed))
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    })
  }

  return (
    <div>
      <FieldLabel htmlFor={`stock-${variantId}`}>In stock</FieldLabel>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          id={`stock-${variantId}`}
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
        />
        {dirty && (
          <Button type="button" size="sm" disabled={pending} onClick={commit}>
            {pending ? <Loader2 className="animate-spin" /> : 'Set'}
          </Button>
        )}
        {saved && !dirty && (
          <Check className="size-4 shrink-0 text-emerald-600" />
        )}
      </div>
      {error ? (
        <p className="text-destructive mt-1 text-xs">{error}</p>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">
          Saved on its own, not with the product.
        </p>
      )}
    </div>
  )
}
