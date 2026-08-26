'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { FormSelect } from '@/components/ui/form-select'
import type { PageCheckoutInput } from '@/server/services/offerAdminService'
import type { CheckoutActionResult } from '@/app/(dashboard)/stores/[storeId]/pages/[pageId]/edit/offer-actions'

/**
 * The builder's Delivery tab: what this page charges to ship, and the
 * spend-and-save ladder it advertises.
 *
 * Offers used to live here too. They moved to Discounts & offers in the sidebar
 * once an offer stopped being a property of one page — a bundle a merchant runs
 * across six campaign pages cannot be edited from inside any one of them
 * without six copies going out of step. What is left is genuinely page-local:
 * a campaign page charges its own delivery, because the price on it is already
 * the negotiated price and the workspace's shipping zones are the default
 * rather than the law.
 *
 * Money is entered in major units (what the merchant types on a price tag) and
 * stored in minor units, which is the conversion that has to happen exactly
 * once and is done here at the boundary.
 */

export interface CheckoutDraft {
  shippingMode: 'INHERIT' | 'FREE' | 'FLAT' | 'ZONES'
  flatRate: string
  askZone: boolean
  rates: { label: string; price: string }[]
  freeShippingEnabled: boolean
  freeShippingMinSubtotal: string
  freeShippingMinQuantity: string
  discountRules: {
    basis: 'SUBTOTAL' | 'QUANTITY'
    threshold: string
    reward: 'AMOUNT' | 'PERCENT'
    value: string
    maxDiscount: string
    label: string
  }[]
}

export interface DeliveryPanelProps {
  storeId: string
  pageId: string
  currencyCode: string
  initialCheckout: CheckoutDraft
  /** How many offers this page can currently sell, for the pointer below. */
  offerCount: number
  saveCheckout: (
    storeId: string,
    pageId: string,
    input: PageCheckoutInput
  ) => Promise<CheckoutActionResult>
  /**
   * Fired after the server accepts a change, so the canvas can recompile.
   *
   * Sections read delivery and promotions from the page rather than from their
   * own settings — which is the point — so nothing about a section's content
   * changes when a rate does, and without this signal the preview goes on
   * showing whatever it compiled before.
   */
  onChange?: () => void
}

/** Major units as typed → minor units. Blank and nonsense both mean zero. */
function toCents(value: string, currencyCode: string): number {
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  const exponent = currencyCode.toUpperCase() === 'JPY' ? 0 : 2
  return Math.round(parsed * 10 ** exponent)
}

function toInt(value: string): number {
  const parsed = Number(String(value).replace(/[^0-9-]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

export function DeliveryPanel({
  storeId,
  pageId,
  currencyCode,
  initialCheckout,
  offerCount,
  saveCheckout,
  onChange,
}: DeliveryPanelProps) {
  const [checkout, setCheckout] = useState(initialCheckout)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function persist(next: CheckoutDraft) {
    setCheckout(next)
    setError(null)

    startTransition(async () => {
      const result = await saveCheckout(storeId, pageId, {
        shippingMode: next.shippingMode,
        flatRateCents: toCents(next.flatRate, currencyCode),
        askZone: next.askZone,
        rates: next.rates.map((rate) => ({
          label: rate.label,
          priceCents: toCents(rate.price, currencyCode),
        })),
        freeShippingEnabled: next.freeShippingEnabled,
        freeShippingMinSubtotalCents: toCents(
          next.freeShippingMinSubtotal,
          currencyCode
        ),
        freeShippingMinQuantity: toInt(next.freeShippingMinQuantity),
        discountRules: next.discountRules.map((rule) => ({
          basis: rule.basis,
          thresholdCents:
            rule.basis === 'SUBTOTAL'
              ? toCents(rule.threshold, currencyCode)
              : 0,
          thresholdQuantity:
            rule.basis === 'QUANTITY' ? toInt(rule.threshold) : 0,
          reward: rule.reward,
          valueCents:
            rule.reward === 'AMOUNT' ? toCents(rule.value, currencyCode) : 0,
          valueBps:
            rule.reward === 'PERCENT'
              ? Math.round(Number(rule.value || 0) * 100)
              : 0,
          maxDiscountCents: toCents(rule.maxDiscount, currencyCode),
          label: rule.label || null,
        })),
      })

      if (!result.ok) {
        setError(result.error)
        return
      }
      onChange?.()
    })
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">What this page sells</h3>
        <p className="text-muted-foreground text-xs">
          {offerCount === 0
            ? 'No offer covers this page yet, so the order form has nothing to sell.'
            : `${offerCount} offer${offerCount === 1 ? '' : 's'} can be bought here, including any your store or workspace runs everywhere.`}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href="/discounts/offers" />}
        >
          <ExternalLink className="size-3.5" />
          {offerCount === 0 ? 'Create an offer' : 'Manage offers'}
        </Button>
      </section>

      <DeliveryEditor
        checkout={checkout}
        currencyCode={currencyCode}
        onChange={persist}
      />

      <PromotionEditor
        checkout={checkout}
        currencyCode={currencyCode}
        onChange={persist}
      />

      {error && <p className="text-destructive text-xs">{error}</p>}
      {pending && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" /> Saving…
        </p>
      )}
    </div>
  )
}

function DeliveryEditor({
  checkout,
  currencyCode,
  onChange,
}: {
  checkout: CheckoutDraft
  currencyCode: string
  onChange: (next: CheckoutDraft) => void
}) {
  const set = <K extends keyof CheckoutDraft>(
    key: K,
    value: CheckoutDraft[K]
  ) => onChange({ ...checkout, [key]: value })

  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-semibold">Delivery</h3>

      <Row label="Charge">
        <FormSelect
          value={checkout.shippingMode}
          onChange={(event) =>
            set(
              'shippingMode',
              event.target.value as CheckoutDraft['shippingMode']
            )
          }
          className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="INHERIT">Use the workspace shipping zones</option>
          <option value="FREE">Free delivery</option>
          <option value="FLAT">One flat rate</option>
          <option value="ZONES">Rates for this page</option>
        </FormSelect>
      </Row>

      {checkout.shippingMode === 'FLAT' && (
        <Row label={`Flat rate (${currencyCode})`}>
          <Input
            inputMode="decimal"
            value={checkout.flatRate}
            onChange={(event) => set('flatRate', event.target.value)}
          />
        </Row>
      )}

      {checkout.shippingMode === 'ZONES' && (
        <div className="space-y-1.5">
          {checkout.rates.map((rate, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                placeholder="ঢাকার ভিতরে"
                value={rate.label}
                onChange={(event) =>
                  set(
                    'rates',
                    checkout.rates.map((candidate, position) =>
                      position === index
                        ? { ...candidate, label: event.target.value }
                        : candidate
                    )
                  )
                }
                className="h-8 flex-1 text-xs"
              />
              <Input
                inputMode="decimal"
                placeholder="60"
                value={rate.price}
                onChange={(event) =>
                  set(
                    'rates',
                    checkout.rates.map((candidate, position) =>
                      position === index
                        ? { ...candidate, price: event.target.value }
                        : candidate
                    )
                  )
                }
                className="h-8 w-20 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  set(
                    'rates',
                    checkout.rates.filter((_, position) => position !== index)
                  )
                }
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remove area"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              set('rates', [...checkout.rates, { label: '', price: '' }])
            }
          >
            <Plus className="size-3" /> Add an area
          </Button>
          <Toggle
            label="Let the buyer pick their area"
            checked={checkout.askZone}
            onChange={(value) => set('askZone', value)}
          />
        </div>
      )}

      <div className="border-t pt-3">
        <Toggle
          label="Free delivery over a threshold"
          checked={checkout.freeShippingEnabled}
          onChange={(value) => set('freeShippingEnabled', value)}
        />
        {checkout.freeShippingEnabled && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Row label={`Over (${currencyCode})`}>
              <Input
                inputMode="decimal"
                value={checkout.freeShippingMinSubtotal}
                onChange={(event) =>
                  set('freeShippingMinSubtotal', event.target.value)
                }
              />
            </Row>
            <Row label="Or items">
              <Input
                inputMode="numeric"
                value={checkout.freeShippingMinQuantity}
                onChange={(event) =>
                  set('freeShippingMinQuantity', event.target.value)
                }
              />
            </Row>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The spend-and-save ladder this page advertises.
 *
 * These rows have always been stored, priced and enforced — the order form
 * shows "add ৳240 more and delivery is free" from them — but there was no way
 * to create one, so the feature existed everywhere except where a merchant
 * could reach it.
 *
 * The rules do not stack: the single best-for-the-buyer matching rung applies.
 * That is worth saying on screen, because a merchant who writes three rungs
 * expecting them to add up sells below cost and only finds out at the end of
 * the campaign.
 */
function PromotionEditor({
  checkout,
  currencyCode,
  onChange,
}: {
  checkout: CheckoutDraft
  currencyCode: string
  onChange: (next: CheckoutDraft) => void
}) {
  const rules = checkout.discountRules

  const update = (index: number, patch: Partial<(typeof rules)[number]>) =>
    onChange({
      ...checkout,
      discountRules: rules.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule
      ),
    })

  return (
    <section className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Spend and save</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...checkout,
              discountRules: [
                ...rules,
                {
                  basis: 'SUBTOTAL',
                  threshold: '',
                  reward: 'AMOUNT',
                  value: '',
                  maxDiscount: '',
                  label: '',
                },
              ],
            })
          }
        >
          <Plus className="size-3.5" /> Add
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
          Reward a bigger basket — &ldquo;spend ৳1500, save ৳200&rdquo;. Applies
          on top of whichever offer the buyer chose.
        </p>
      ) : (
        <p className="text-muted-foreground text-[11px]">
          Only the best matching rule applies; they do not add up.
        </p>
      )}

      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div key={index} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <FormSelect
                value={rule.basis}
                onChange={(event) =>
                  update(index, {
                    basis: event.target.value as 'SUBTOTAL' | 'QUANTITY',
                  })
                }
                className="border-input h-8 flex-1 rounded border bg-transparent px-1.5 text-[11px]"
              >
                <option value="SUBTOTAL">Spend over</option>
                <option value="QUANTITY">Buy at least</option>
              </FormSelect>
              <Input
                inputMode="decimal"
                placeholder={rule.basis === 'QUANTITY' ? '3' : '1500'}
                value={rule.threshold}
                onChange={(event) =>
                  update(index, { threshold: event.target.value })
                }
                className="h-8 w-20 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...checkout,
                    discountRules: rules.filter(
                      (_, position) => position !== index
                    ),
                  })
                }
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remove rule"
              >
                <Trash2 className="size-3" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <FormSelect
                value={rule.reward}
                onChange={(event) =>
                  update(index, {
                    reward: event.target.value as 'AMOUNT' | 'PERCENT',
                  })
                }
                className="border-input h-8 flex-1 rounded border bg-transparent px-1.5 text-[11px]"
              >
                <option value="AMOUNT">Take off ({currencyCode})</option>
                <option value="PERCENT">Take off (%)</option>
              </FormSelect>
              <Input
                inputMode="decimal"
                placeholder={rule.reward === 'PERCENT' ? '10' : '200'}
                value={rule.value}
                onChange={(event) =>
                  update(index, { value: event.target.value })
                }
                className="h-8 w-20 text-xs"
              />
            </div>

            {/* A percentage with no ceiling is usually a typo rather than an
                intention, and the one order of the month that is ten times the
                average is where it costs real money. */}
            {rule.reward === 'PERCENT' && (
              <Input
                inputMode="decimal"
                placeholder={`Cap the discount (${currencyCode}) — optional`}
                value={rule.maxDiscount}
                onChange={(event) =>
                  update(index, { maxDiscount: event.target.value })
                }
                className="h-8 text-[11px]"
              />
            )}

            <Input
              placeholder="Shown to the buyer — optional"
              value={rule.label}
              onChange={(event) => update(index, { label: event.target.value })}
              className="h-8 text-[11px]"
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
