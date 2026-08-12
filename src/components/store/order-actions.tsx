'use client'

import { useActionState, useState, useTransition } from 'react'
import { Package, RotateCcw, XCircle } from 'lucide-react'
import {
  addOrderNoteAction,
  cancelOrderAction,
  fulfillOrderAction,
  markOrderPaidAction,
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
import { formatMoney } from '@/lib/money'

export interface OrderLineSummary {
  id: string
  title: string
  variantTitle: string | null
  quantity: number
  fulfilledQuantity: number
  refundedQuantity: number
  unitPriceCents: number
}

/**
 * Fulfilment.
 *
 * Quantities default to everything still outstanding, because shipping the
 * whole remaining order is what happens most of the time — a partial shipment
 * is the exception and should cost a keystroke, not the common case.
 */
export function FulfillPanel({
  orderId,
  lines,
  locations,
}: {
  orderId: string
  lines: OrderLineSummary[]
  locations: { id: string; name: string }[]
}) {
  const outstanding = lines.filter(
    (line) => line.quantity - line.fulfilledQuantity > 0
  )

  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      outstanding.map((line) => [
        line.id,
        line.quantity - line.fulfilledQuantity,
      ])
    )
  )

  const boundAction = fulfillOrderAction.bind(null, orderId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  if (outstanding.length === 0) return null

  const payload = JSON.stringify(
    Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderLineId, quantity]) => ({ orderLineId, quantity }))
  )

  return (
    <Card>
      <CardContent>
        <form action={action}>
          <input type="hidden" name="lines" value={payload} />
          <FieldGroup>
            <h3 className="font-display flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Package className="size-4.5" />
              Fulfil items
            </h3>

            <div className="flex flex-col gap-2">
              {outstanding.map((line) => {
                const max = line.quantity - line.fulfilledQuantity
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {line.title}
                      </p>
                      {line.variantTitle &&
                        line.variantTitle !== 'Default Title' && (
                          <p className="text-muted-foreground text-xs">
                            {line.variantTitle}
                          </p>
                        )}
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

            {locations.length > 1 && (
              <Field>
                <FieldLabel htmlFor="locationId">Ship from</FieldLabel>
                <FormSelect id="locationId" name="locationId">
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </FormSelect>
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="trackingCompany">Carrier</FieldLabel>
                <Input id="trackingCompany" name="trackingCompany" />
              </Field>
              <Field>
                <FieldLabel htmlFor="trackingNumber">
                  Tracking number
                </FieldLabel>
                <Input id="trackingNumber" name="trackingNumber" />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="trackingUrl">Tracking URL</FieldLabel>
              <Input id="trackingUrl" name="trackingUrl" type="url" />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <Switch name="notifyCustomer" defaultChecked />
              Notify the customer
            </label>

            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}

            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? 'Fulfilling…' : 'Mark as fulfilled'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Refunds.
 *
 * Quantities start at zero rather than the full order: a refund moves real
 * money and the amounts should be chosen deliberately, which is the opposite
 * of the fulfilment default above.
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
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {line.title}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatMoney(line.unitPriceCents, currencyCode)} each ·{' '}
                        {max} refundable
                      </p>
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
              Return unfulfilled items to stock
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
