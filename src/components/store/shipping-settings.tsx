'use client'

import { useActionState, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  createShippingRateAction,
  createShippingZoneAction,
  deleteShippingRateAction,
  deleteShippingZoneAction,
  createTaxRateAction,
  deleteTaxRateAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { MoneyInput } from '@/components/store/form-controls'
import { formatMoney, bpsToPercent } from '@/lib/money'

export interface ZoneView {
  id: string
  name: string
  countryCodes: string[]
  rates: {
    id: string
    name: string
    description: string | null
    priceCents: number
    minSubtotalCents: number | null
    maxSubtotalCents: number | null
  }[]
}

/**
 * Shipping zones and their rates.
 *
 * A zone with no rates is called out explicitly: the pricing engine reports
 * shipping as unavailable for a destination with no matching rate and blocks
 * checkout, which from the merchant's side looks like customers silently
 * abandoning. Better to say it here.
 */
export function ShippingSettings({
  currencyCode,
  zones,
}: {
  currencyCode: string
  zones: ZoneView[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [addingZone, setAddingZone] = useState(false)

  const createZone = createShippingZoneAction.bind(null)
  const [zoneState, zoneAction, zonePending] = useActionState<
    StoreActionState,
    FormData
  >(createZone, undefined)

  return (
    <div className="flex flex-col gap-6">
      {zones.map((zone) => (
        <Card key={zone.id}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight">
                  {zone.name}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {zone.countryCodes.length === 0
                    ? 'Everywhere not covered by another zone'
                    : zone.countryCodes.join(', ')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete zone"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteShippingZoneAction(zone.id)
                    setError(result?.error ?? null)
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>

            {zone.rates.length === 0 ? (
              <p className="text-destructive text-sm">
                This zone has no rates, so checkout is blocked for these
                countries. Add at least one.
              </p>
            ) : (
              <div className="divide-border/60 flex flex-col divide-y">
                {zone.rates.map((rate) => (
                  <div
                    key={rate.id}
                    className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{rate.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatMoney(rate.priceCents, currencyCode)}
                        {rate.minSubtotalCents !== null &&
                          ` · from ${formatMoney(rate.minSubtotalCents, currencyCode)}`}
                        {rate.maxSubtotalCents !== null &&
                          ` · up to ${formatMoney(rate.maxSubtotalCents, currencyCode)}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete rate"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await deleteShippingRateAction(rate.id)
                          setError(result?.error ?? null)
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <AddRateForm zoneId={zone.id} currencyCode={currencyCode} />
          </CardContent>
        </Card>
      ))}

      {error && <FieldError>{error}</FieldError>}

      {addingZone ? (
        <Card>
          <CardContent>
            <form action={zoneAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="zone-name">Zone name</FieldLabel>
                  <Input
                    id="zone-name"
                    name="name"
                    placeholder="Europe"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="zone-countries">Countries</FieldLabel>
                  <Input
                    id="zone-countries"
                    name="countryCodes"
                    placeholder="GB, FR, DE"
                  />
                  <FieldDescription>
                    Comma-separated 2-letter ISO codes. Leave empty for a
                    rest-of-world catch-all.
                  </FieldDescription>
                </Field>
                {zoneState?.error && <FieldError>{zoneState.error}</FieldError>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={zonePending}>
                    {zonePending ? 'Creating…' : 'Create zone'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAddingZone(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddingZone(true)}
          >
            <Plus />
            Add zone
          </Button>
        </div>
      )}
    </div>
  )
}

function AddRateForm({
  zoneId,
  currencyCode,
}: {
  zoneId: string
  currencyCode: string
}) {
  const bound = createShippingRateAction.bind(null, zoneId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    bound,
    undefined
  )
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus />
          Add rate
        </Button>
      </div>
    )
  }

  return (
    <form action={action} className="rounded-lg border p-4">
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Rate name</FieldLabel>
            <Input name="name" placeholder="Standard" required />
          </Field>
          <Field>
            <FieldLabel>Price</FieldLabel>
            <MoneyInput
              name="price"
              currencyCode={currencyCode}
              placeholder="0.00"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Minimum order</FieldLabel>
            <MoneyInput
              name="minSubtotal"
              currencyCode={currencyCode}
              placeholder="No minimum"
            />
          </Field>
          <Field>
            <FieldLabel>Maximum order</FieldLabel>
            <MoneyInput
              name="maxSubtotal"
              currencyCode={currencyCode}
              placeholder="No maximum"
            />
            <FieldDescription>
              Use a minimum to offer free shipping over a threshold.
            </FieldDescription>
          </Field>
        </div>
        {state?.error && <FieldError>{state.error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Adding…' : 'Add rate'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

// ── Taxes ────────────────────────────────────────────────────────────────

export function TaxSettings({
  rates,
}: {
  rates: {
    id: string
    name: string
    countryCode: string
    provinceCode: string | null
    rateBps: number
    appliesToShipping: boolean
  }[]
}) {
  const bound = createTaxRateAction.bind(null)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    bound,
    undefined
  )
  const [deleting, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <h3 className="font-display text-lg font-semibold tracking-tight">
            Tax rates
          </h3>

          {rates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tax rates yet. Without one, no tax is charged at checkout.
            </p>
          ) : (
            <div className="divide-border/60 flex flex-col divide-y">
              {rates.map((rate) => (
                <div
                  key={rate.id}
                  className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {rate.name}{' '}
                      <Badge variant="secondary">
                        {bpsToPercent(rate.rateBps)}%
                      </Badge>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {rate.countryCode}
                      {rate.provinceCode && ` · ${rate.provinceCode}`}
                      {rate.appliesToShipping && ' · also taxes shipping'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete rate"
                    disabled={deleting}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteTaxRateAction(rate.id)
                        setError(result?.error ?? null)
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {error && <FieldError>{error}</FieldError>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                Add a rate
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tax-name">Name</FieldLabel>
                  <Input id="tax-name" name="name" placeholder="VAT" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tax-percent">Rate</FieldLabel>
                  <Input
                    id="tax-percent"
                    name="percent"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="20"
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tax-country">Country</FieldLabel>
                  <Input
                    id="tax-country"
                    name="countryCode"
                    placeholder="GB"
                    maxLength={2}
                    className="uppercase"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tax-province">Region</FieldLabel>
                  <Input
                    id="tax-province"
                    name="provinceCode"
                    placeholder="Optional"
                  />
                  <FieldDescription>
                    A region-specific rate replaces the country rate rather than
                    stacking on top of it.
                  </FieldDescription>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch name="appliesToShipping" />
                Also charge tax on shipping
              </label>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Adding…' : 'Add tax rate'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Locations ────────────────────────────────────────────────────────────
