'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import {
  saveOrderStatusColorsAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'
import {
  DEFAULT_STATUS_COLORS,
  STATUS_TONES,
  TONE_STYLES,
  resolveStatusColors,
  type StatusColorMap,
  type StatusTone,
} from '@/lib/order-status-colors'
import type { OrderWorkflowState } from '@/generated/prisma/enums'
import { cn } from '@/lib/utils'

/** The statuses, in pipeline order rather than alphabetical. */
const STATES = Object.keys(DEFAULT_STATUS_COLORS) as OrderWorkflowState[]

/**
 * Choosing what each delivery status looks like in the list.
 *
 * A row of swatches per status rather than a colour picker: the point is that
 * the list stays readable, and a free colour choice eventually produces a row
 * nobody can read in one of the two themes. Seven fixed tones is also few
 * enough that the whole map fits on one screen, which matters because the real
 * decision being made here is a relative one — "returns should be louder than
 * delivered" — and that cannot be made one status at a time.
 */
export function OrderStatusColorSettings({
  current,
  trigger,
}: {
  current: StatusColorMap
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-h-[90vh] w-full max-w-[calc(100%-1rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {open && (
          <ColorForm
            key={String(open)}
            current={current}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ColorForm({
  current,
  onDone,
}: {
  current: StatusColorMap
  onDone: () => void
}) {
  const [colors, setColors] = useState<Record<OrderWorkflowState, StatusTone>>(
    () => resolveStatusColors(current)
  )

  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    saveOrderStatusColorsAction,
    undefined
  )

  useEffect(() => {
    if (state?.success) onDone()
  }, [state?.success, onDone])

  const isDefault = STATES.every(
    (status) => colors[status] === DEFAULT_STATUS_COLORS[status]
  )

  return (
    <form action={action} className="flex max-h-[90vh] min-h-0 flex-col">
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />

      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle className="font-display text-lg font-semibold tracking-tight">
          Order list colours
        </DialogTitle>
        <p className="text-muted-foreground text-sm">
          Pick the colour each delivery status paints its row. Everyone in this
          workspace sees the same key.
        </p>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-1">
          {STATES.map((status) => {
            const tone = colors[status]
            return (
              <div
                key={status}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors',
                  // The row previews itself. Reading a swatch and imagining the
                  // list is a step nobody should have to take.
                  TONE_STYLES[tone].row || 'bg-transparent'
                )}
              >
                <span className="relative flex items-center gap-2.5 text-sm font-medium">
                  <span
                    aria-hidden
                    className={cn(
                      'h-5 w-[3px] rounded-full',
                      TONE_STYLES[tone].bar
                    )}
                  />
                  {WORKFLOW_STATE_LABEL[status]}
                </span>

                <div
                  role="radiogroup"
                  aria-label={`Colour for ${WORKFLOW_STATE_LABEL[status]}`}
                  className="flex items-center gap-1"
                >
                  {STATUS_TONES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={tone === option}
                      aria-label={TONE_STYLES[option].label}
                      title={TONE_STYLES[option].label}
                      onClick={() =>
                        setColors((currentColors) => ({
                          ...currentColors,
                          [status]: option,
                        }))
                      }
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full transition-transform',
                        TONE_STYLES[option].swatch,
                        tone === option
                          ? 'ring-foreground ring-2 ring-offset-2 ring-offset-[var(--color-card)]'
                          : 'hover:scale-110'
                      )}
                    >
                      {/* The ring already says which is chosen; the tick is
                          for anyone who cannot see the ring's contrast. Not
                          `mix-blend-difference` — on the darker swatches that
                          inverted to almost exactly the swatch colour. */}
                      {tone === option && option !== 'none' && (
                        <Check className="size-3 stroke-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-2 rounded-none border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => setColors(resolveStatusColors({}))}
          >
            <RotateCcw />
            Reset to defaults
          </Button>
          {state?.error && (
            <p className="text-destructive text-xs">{state.error}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            Save colours
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
