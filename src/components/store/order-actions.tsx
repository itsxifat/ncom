'use client'

import { useActionState, useState, useTransition } from 'react'
import { Package, PackageX, RotateCcw, XCircle } from 'lucide-react'
import {
  addOrderNoteAction,
  cancelOrderAction,
  markOrderPaidAction,
  recordReturnAction,
  refundOrderAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Card, CardContent } from '@/components/ui/card'
import { FormSelect, MoneyInput } from '@/components/store/form-controls'
import { ProductThumb } from '@/components/media/product-thumb'
import { formatMoney } from '@/lib/money'

export interface OrderLineSummary {
  id: string
  title: string
  /** Null when the product was deleted, or never had a photo. */
  imageUrl: string | null
  variantTitle: string | null
  quantity: number
  refundedQuantity: number
  returnedQuantity: number
  unitPriceCents: number
}

/**
 * Refunds.
 *
 * Quantities start at zero rather than the full order: a refund moves real
 * money and the amounts should be chosen deliberately.
 */
export function RefundPanel({
  orderId,
  lines,
  currencyCode,
  refundableCents,
}: {
  orderId: string
  lines: OrderLineSummary[]
  currencyCode: string
  refundableCents: number
}) {
  const refundable = lines.filter(
    (line) => line.quantity - line.refundedQuantity > 0
  )

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [open, setOpen] = useState(false)

  const boundAction = refundOrderAction.bind(null, orderId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  if (refundable.length === 0 || refundableCents <= 0) return null

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw />
        Refund
      </Button>
    )
  }

  const payload = JSON.stringify(
    Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderLineId, quantity]) => ({ orderLineId, quantity }))
  )

  const estimated = refundable.reduce(
    (sum, line) => sum + (quantities[line.id] ?? 0) * line.unitPriceCents,
    0
  )

  return (
    <Card className="w-full">
      <CardContent>
        <form action={action}>
          <input type="hidden" name="lines" value={payload} />
          <FieldGroup>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Refund items
            </h3>
            <p className="text-muted-foreground text-sm">
              Up to {formatMoney(refundableCents, currencyCode)} can be refunded
              on this order.
            </p>

            <div className="flex flex-col gap-2">
              {refundable.map((line) => {
                const max = line.quantity - line.refundedQuantity
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ProductThumb
                        src={line.imageUrl}
                        alt={line.title}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {line.title}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatMoney(line.unitPriceCents, currencyCode)} each
                          · {max} refundable
                        </p>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={max}
                      value={quantities[line.id] ?? 0}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.id]: Math.min(
                            Math.max(Number(event.target.value) || 0, 0),
                            max
                          ),
                        }))
                      }
                      className="w-24"
                    />
                  </div>
                )
              })}
            </div>

            <Field>
              <FieldLabel htmlFor="shipping">Refund shipping</FieldLabel>
              <MoneyInput
                id="shipping"
                name="shipping"
                currencyCode={currencyCode}
                placeholder="0.00"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="reason">Reason</FieldLabel>
              <Input
                id="reason"
                name="reason"
                placeholder="Customer changed their mind"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <Switch name="restock" defaultChecked />
              Return items to stock
            </label>

            <p className="text-sm">
              Estimated line refund:{' '}
              <strong>{formatMoney(estimated, currencyCode)}</strong>
              <span className="text-muted-foreground">
                {' '}
                — the exact figure is recomputed on the server from the
                discounted price actually paid.
              </span>
            </p>

            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'Refunding…' : 'Refund'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Returns, whole or partial.
 *
 * Distinct from a refund and deliberately placed beside it, because the two are
 * confused constantly and the difference decides whether the merchant's revenue
 * figures are true. A refund sends money back to someone who paid. A return is
 * goods coming back — and on a cash-on-delivery order, usually no money ever
 * moved at all, so there is nothing to send anywhere.
 *
 * Quantities start at zero for the same reason the refund panel's do: this
 * rewrites the order total, and a default of "everything" is the wrong thing to
 * confirm by reflex.
 */
export function ReturnPanel({
  orderId,
  lines,
  currencyCode,
}: {
  orderId: string
  lines: OrderLineSummary[]
  currencyCode: string
}) {
  const returnable = lines.filter(
    (line) => line.quantity - line.returnedQuantity > 0
  )

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [open, setOpen] = useState(false)

  const boundAction = recordReturnAction.bind(null, orderId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  if (returnable.length === 0) return null

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <PackageX />
        Record return
      </Button>
    )
  }

  const payload = JSON.stringify(
    Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderLineId, quantity]) => ({ orderLineId, quantity }))
  )

  const comingBack = returnable.reduce(
    (sum, line) => sum + (quantities[line.id] ?? 0) * line.unitPriceCents,
    0
  )

  return (
    <Card className="w-full">
      <CardContent>
        <form action={action}>
          <input type="hidden" name="lines" value={payload} />
          <FieldGroup>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Record a return
            </h3>
            <p className="text-muted-foreground text-sm">
              For goods the customer refused or sent back. The order total is
              recalculated, with any discount re-applied in proportion to what
              they kept.
            </p>

            <div className="flex flex-col gap-2">
              {returnable.map((line) => {
                const max = line.quantity - line.returnedQuantity
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ProductThumb
                        src={line.imageUrl}
                        alt={line.title}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {line.title}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatMoney(line.unitPriceCents, currencyCode)} each
                          · {max} still with the customer
                        </p>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={max}
                      value={quantities[line.id] ?? 0}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.id]: Math.min(
                            Math.max(Number(event.target.value) || 0, 0),
                            max
                          ),
                        }))
                      }
                      className="w-24"
                    />
                  </div>
                )
              })}
            </div>

            <p className="text-muted-foreground text-sm">
              Goods coming back: {formatMoney(comingBack, currencyCode)}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <Switch name="restock" defaultChecked />
              Put these items back into stock
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Switch name="waiveDelivery" />
              Waive the delivery charge
            </label>

            <Field>
              <FieldLabel htmlFor="return-note">Note</FieldLabel>
              <Textarea
                id="return-note"
                name="note"
                rows={2}
                placeholder="Why did it come back? (optional)"
              />
            </Field>

            {state?.error && <FieldError>{state.error}</FieldError>}

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Recording…' : 'Record return'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export function CancelOrderPanel({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const boundAction = cancelOrderAction.bind(null, orderId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        <XCircle />
        Cancel order
      </Button>
    )
  }

  return (
    <Card className="w-full">
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Cancel this order
            </h3>
            <p className="text-muted-foreground text-sm">
              Cancelling does not refund money. Record a refund separately if
              the customer has already paid.
            </p>

            <Field>
              <FieldLabel htmlFor="reason">Reason</FieldLabel>
              <FormSelect id="reason" name="reason" defaultValue="CUSTOMER">
                <option value="CUSTOMER">Customer changed their mind</option>
                <option value="INVENTORY">Out of stock</option>
                <option value="FRAUD">Suspected fraud</option>
                <option value="DECLINED">Payment declined</option>
                <option value="OTHER">Other</option>
              </FormSelect>
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <Switch name="restock" defaultChecked />
              Return these items to stock
            </label>

            {state?.error && <FieldError>{state.error}</FieldError>}

            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'Cancelling…' : 'Cancel order'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Keep order
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export function MarkPaidButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markOrderPaidAction(orderId)
            setError(result?.error ?? null)
          })
        }
      >
        {pending ? 'Recording…' : 'Mark as paid'}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

export function OrderNoteForm({
  orderId,
  note,
}: {
  orderId: string
  note: string | null
}) {
  const boundAction = addOrderNoteAction.bind(null, orderId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="note">Order note</FieldLabel>
          <Textarea id="note" name="note" rows={3} defaultValue={note ?? ''} />
        </Field>
        {state?.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save note'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
