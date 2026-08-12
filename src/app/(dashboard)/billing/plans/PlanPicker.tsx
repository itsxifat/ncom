'use client'

import { useActionState, useState } from 'react'
import { Check, Info, Loader2, Lock, TicketPercent } from 'lucide-react'
import { checkoutAction, quoteCheckoutAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Money } from '@/components/store/form-controls'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import {
  AVAILABILITY_LABELS,
  FEATURE_KEYS,
  FEATURE_LABELS,
  annualSavingsPercent,
  formatQuota,
} from '@/lib/plans'
import type { CheckoutQuote } from '@/server/services/planCheckoutService'

export interface PickerPlan {
  id: string
  code: string
  name: string
  tagline: string | null
  currencyCode: string
  monthlyPriceCents: number
  annualPriceCents: number | null
  isContactSalesOnly: boolean
  trialDays: number
  fairUseNote: string | null
  quotaLabels: { label: string; value: string }[]
  availability: Record<string, string>
}

export interface PickerAddon {
  id: string
  name: string
  description: string | null
  currencyCode: string
  monthlyPriceCents: number
  annualPriceCents: number | null
  maxQuantity: number | null
  planIds: string[] | null
}

/**
 * Plan picker and checkout in one screen.
 *
 * One screen rather than a wizard because there are only three decisions —
 * which plan, monthly or annual, any add-ons — and a coupon that can take the
 * total to zero. Splitting that across steps would mean re-quoting on every
 * navigation.
 *
 * The total shown always comes from the server (`quoteCheckoutAction`), never
 * from arithmetic in the browser. Coupon rules are the server's business, and a
 * client-side estimate would disagree with the real charge the moment any rule
 * applies.
 */
export function PlanPicker({
  plans,
  addons,
  currentPlanId,
  currentInterval,
  couponsEnabled,
  showPaymentStep,
}: {
  plans: PickerPlan[]
  addons: PickerAddon[]
  currentPlanId: string
  currentInterval: 'MONTHLY' | 'ANNUAL'
  couponsEnabled: boolean
  showPaymentStep: boolean
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId)
  const [interval, setInterval] = useState<'MONTHLY' | 'ANNUAL'>(
    currentInterval
  )
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [couponCode, setCouponCode] = useState('')

  const [quoteState, quoteFormAction, quoting] = useActionState(
    quoteCheckoutAction,
    undefined
  )
  const [checkoutState, checkoutFormAction, checkingOut] = useActionState(
    checkoutAction,
    undefined
  )

  const selected = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0]
  const quote = quoteState?.quote

  // The quote is only trustworthy for the combination it was priced for. A stale
  // total from a previous selection is worse than no total, so it is hidden the
  // moment anything changes.
  const quoteMatchesSelection =
    quote?.planId === selected?.id && quote?.interval === interval

  const availableAddons = addons.filter(
    (addon) =>
      addon.planIds === null || addon.planIds.includes(selected?.id ?? '')
  )

  function priceFor(plan: PickerPlan): number | null {
    if (plan.isContactSalesOnly) return null
    return interval === 'ANNUAL'
      ? (plan.annualPriceCents ?? null)
      : plan.monthlyPriceCents
  }

  /** Both forms submit the same fields; this keeps them identical. */
  function hiddenFields() {
    return (
      <>
        <input type="hidden" name="planId" value={selected?.id ?? ''} />
        <input type="hidden" name="planName" value={selected?.name ?? ''} />
        <input type="hidden" name="interval" value={interval} />
        <input type="hidden" name="couponCode" value={couponCode} />
        {Object.entries(quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([addonId, quantity]) => (
            <input
              key={addonId}
              type="hidden"
              name={`addon:${addonId}`}
              value={quantity}
            />
          ))}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2">
        <div className="bg-muted inline-flex rounded-full p-1">
          {(['MONTHLY', 'ANNUAL'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setInterval(option)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                interval === option
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option === 'MONTHLY' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
        {interval === 'ANNUAL' && (
          <span className="text-xs text-emerald-600">Two months free</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const price = priceFor(plan)
          const isSelected = plan.id === selected?.id
          const isCurrent = plan.id === currentPlanId
          const savings = annualSavingsPercent(
            plan.monthlyPriceCents,
            plan.annualPriceCents
          )
          const notOfferedAnnually =
            interval === 'ANNUAL' && !plan.isContactSalesOnly && price === null

          return (
            <Card
              key={plan.id}
              className={cn(
                'cursor-pointer transition-all',
                isSelected && 'ring-primary ring-2',
                notOfferedAnnually && 'opacity-60'
              )}
              onClick={() => !notOfferedAnnually && setSelectedPlanId(plan.id)}
            >
              <CardContent className="flex h-full flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-lg font-semibold">
                      {plan.name}
                    </h3>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                  </div>
                  {plan.tagline && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {plan.tagline}
                    </p>
                  )}
                </div>

                <div>
                  {plan.isContactSalesOnly ? (
                    <p className="font-display text-2xl font-semibold">
                      Custom
                    </p>
                  ) : notOfferedAnnually ? (
                    <p className="text-muted-foreground text-sm">
                      Monthly only
                    </p>
                  ) : (
                    <>
                      <p className="font-display text-2xl font-semibold">
                        {formatMoney(price ?? 0, plan.currencyCode)}
                        <span className="text-muted-foreground text-sm font-normal">
                          /{interval === 'ANNUAL' ? 'year' : 'month'}
                        </span>
                      </p>
                      {interval === 'ANNUAL' && savings && (
                        <p className="text-xs text-emerald-600">
                          Save {savings}%
                        </p>
                      )}
                    </>
                  )}
                  {plan.trialDays > 0 && (
                    <p className="text-muted-foreground text-xs">
                      {plan.trialDays}-day trial
                    </p>
                  )}
                </div>

                <ul className="flex flex-col gap-1 text-xs">
                  {plan.quotaLabels.map((quota) => (
                    <li
                      key={quota.label}
                      className="flex justify-between gap-2"
                    >
                      <span className="text-muted-foreground">
                        {quota.label}
                      </span>
                      <span className="font-medium">{quota.value}</span>
                    </li>
                  ))}
                </ul>

                <ul className="mt-auto flex flex-col gap-1 text-xs">
                  {FEATURE_KEYS.slice(0, 5).map((key) => {
                    const availability = plan.availability[key] ?? 'UNAVAILABLE'
                    const included =
                      availability === 'INCLUDED' || availability === 'LIMITED'
                    return (
                      <li key={key} className="flex items-center gap-1.5">
                        {included ? (
                          <Check className="size-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <Lock className="text-muted-foreground size-3 shrink-0" />
                        )}
                        <span
                          className={included ? '' : 'text-muted-foreground'}
                        >
                          {FEATURE_LABELS[key]}
                          {availability === 'ADDON' && ' (add-on)'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {selected?.isContactSalesOnly ? (
        <Card>
          <CardContent>
            <p className="text-sm">
              {selected.name} is put together with our team — limits, white
              labelling and support are agreed with you rather than picked from
              a list.
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              Get in touch and we will set it up on this workspace.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            {availableAddons.length > 0 && (
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm font-medium">Add-ons</p>
                  {availableAddons.map((addon) => {
                    const unit =
                      interval === 'ANNUAL'
                        ? (addon.annualPriceCents ??
                          addon.monthlyPriceCents * 12)
                        : addon.monthlyPriceCents
                    const quantity = quantities[addon.id] ?? 0
                    const isSwitch = addon.maxQuantity === 1

                    return (
                      <div
                        key={addon.id}
                        className="flex items-start justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm">{addon.name}</p>
                          {addon.description && (
                            <p className="text-muted-foreground text-xs">
                              {addon.description}
                            </p>
                          )}
                          <p className="text-muted-foreground text-xs">
                            {formatMoney(unit, addon.currencyCode)}/
                            {interval === 'ANNUAL' ? 'year' : 'month'}
                            {!isSwitch && ' each'}
                          </p>
                        </div>

                        {isSwitch ? (
                          <input
                            type="checkbox"
                            checked={quantity > 0}
                            onChange={(event) =>
                              setQuantities((previous) => ({
                                ...previous,
                                [addon.id]: event.target.checked ? 1 : 0,
                              }))
                            }
                            className="mt-1 size-4 shrink-0"
                            aria-label={addon.name}
                          />
                        ) : (
                          <Input
                            inputMode="numeric"
                            value={String(quantity)}
                            onChange={(event) => {
                              const next = Number(event.target.value)
                              setQuantities((previous) => ({
                                ...previous,
                                [addon.id]: Number.isFinite(next)
                                  ? Math.max(0, next)
                                  : 0,
                              }))
                            }}
                            className="h-8 w-16 shrink-0 text-center"
                            aria-label={`${addon.name} quantity`}
                          />
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {couponsEnabled && (
              <Card>
                <CardContent>
                  <form
                    action={quoteFormAction}
                    className="flex flex-col gap-3"
                  >
                    {hiddenFields()}
                    <Field>
                      <FieldLabel htmlFor="couponInput">
                        <TicketPercent className="mr-1 inline size-4" />
                        Coupon code
                      </FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          id="couponInput"
                          value={couponCode}
                          onChange={(event) =>
                            setCouponCode(event.target.value.toUpperCase())
                          }
                          placeholder="NCOMEXPLORE"
                          className="font-mono uppercase"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          disabled={quoting}
                        >
                          {quoting ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            'Apply'
                          )}
                        </Button>
                      </div>
                      {quoteMatchesSelection && quote?.couponError && (
                        <FieldError>{quote.couponError.message}</FieldError>
                      )}
                      {quoteMatchesSelection && quote?.coupon && (
                        <p className="text-xs text-emerald-600">
                          {quote.coupon.code} applied — {quote.coupon.summary}
                        </p>
                      )}
                      {quoteState?.error && (
                        <FieldError>{quoteState.error}</FieldError>
                      )}
                    </Field>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="h-fit">
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm font-medium">Summary</p>

              {quoteMatchesSelection && quote ? (
                <>
                  <div className="flex flex-col gap-2 text-sm">
                    {quote.lines.map((line) => (
                      <div
                        key={`${line.kind}-${line.refId}`}
                        className="flex justify-between gap-3"
                      >
                        <span className="text-muted-foreground min-w-0">
                          {line.label}
                          {line.quantity > 1 && ` × ${line.quantity}`}
                        </span>
                        <Money>
                          {formatMoney(line.amountCents, quote.currencyCode)}
                        </Money>
                      </div>
                    ))}

                    {quote.discountCents > 0 && (
                      <div className="flex justify-between gap-3 text-emerald-600">
                        <span>Discount</span>
                        <Money>
                          −
                          {formatMoney(quote.discountCents, quote.currencyCode)}
                        </Money>
                      </div>
                    )}
                  </div>

                  <div className="border-border flex items-baseline justify-between gap-3 border-t pt-3">
                    <span className="font-medium">Total</span>
                    <span className="font-display text-xl font-semibold">
                      {formatMoney(quote.totalCents, quote.currencyCode)}
                      <span className="text-muted-foreground text-xs font-normal">
                        /{interval === 'ANNUAL' ? 'year' : 'month'}
                      </span>
                    </span>
                  </div>

                  {showPaymentStep && (
                    <div className="bg-muted rounded-xl p-3 text-xs">
                      <p className="font-medium">Payment</p>
                      {quote.isFree ? (
                        <p className="text-muted-foreground mt-1">
                          Nothing to pay — no payment details needed. Your plan
                          switches on as soon as you confirm.
                        </p>
                      ) : (
                        <p className="text-muted-foreground mt-1">
                          <Info className="mr-1 inline size-3.5" />
                          Online payment isn&apos;t open yet. Confirming records
                          your request and our team will contact you to complete
                          it — your current plan keeps running until then.
                        </p>
                      )}
                    </div>
                  )}

                  <form action={checkoutFormAction}>
                    {hiddenFields()}
                    <Button
                      type="submit"
                      disabled={checkingOut || Boolean(quote.couponError)}
                      className="w-full"
                    >
                      {checkingOut
                        ? 'Confirming…'
                        : quote.isFree
                          ? 'Confirm and switch on'
                          : 'Confirm request'}
                    </Button>
                  </form>

                  {checkoutState?.error && (
                    <FieldError>{checkoutState.error}</FieldError>
                  )}
                </>
              ) : (
                <form action={quoteFormAction} className="flex flex-col gap-3">
                  {hiddenFields()}
                  <p className="text-muted-foreground text-sm">
                    {selected?.name} ·{' '}
                    {interval === 'ANNUAL' ? 'yearly' : 'monthly'}
                    {Object.values(quantities).some(
                      (quantity) => quantity > 0
                    ) && ' + add-ons'}
                  </p>
                  <Button type="submit" disabled={quoting} className="w-full">
                    {quoting ? 'Pricing…' : 'See total'}
                  </Button>
                  {quoteState?.error && (
                    <FieldError>{quoteState.error}</FieldError>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
