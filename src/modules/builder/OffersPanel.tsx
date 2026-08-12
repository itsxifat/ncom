'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { formatMoney, formatMoneyAmount } from '@/lib/money'
import type { OfferProduct } from '@/server/services/productService'
import type {
  OfferInput,
  PageCheckoutInput,
} from '@/server/services/offerAdminService'
import type { OfferActionResult } from '@/app/(dashboard)/stores/[storeId]/pages/[pageId]/edit/offer-actions'

/**
 * The Offers tab: what this landing page actually sells.
 *
 * Separate from the section Inspector on purpose. A section is a piece of the
 * page's *design*; an offer is a piece of its *commerce*, shared by every
 * section that quotes a price. Editing the bundle in one place and having the
 * cards, the sticky bar and the order form all follow is the entire point — so
 * this panel sits beside the section editor rather than inside any one section.
 *
 * Money is entered in major units (what the merchant types on a price tag) and
 * stored in minor units, which is the conversion that has to happen exactly
 * once and is done here at the boundary.
 */

export interface OfferDraft {
  id: string | null
  label: string
  description: string
  badge: string
  kind: 'FIXED' | 'COLLECTION' | 'ALACARTE'
  pricingMode: 'AUTO' | 'FIXED' | 'PERCENT' | 'AMOUNT'
  /** Major units as typed. Converted on save. */
  price: string
  discountPercent: string
  compareAt: string
  minQuantity: string
  maxQuantity: string
  isDefault: boolean
  isActive: boolean
  items: { productId: string; variantId: string | null; quantity: number }[]
  tiers: { quantity: string; price: string }[]
}

export interface OffersPanelProps {
  storeId: string
  pageId: string
  products: OfferProduct[]
  currencyCode: string
  initialOffers: OfferDraft[]
  initialCheckout: CheckoutDraft
  saveOffer: (
    storeId: string,
    pageId: string,
    offerId: string | null,
    input: OfferInput
  ) => Promise<OfferActionResult>
  deleteOffer: (
    storeId: string,
    pageId: string,
    offerId: string
  ) => Promise<OfferActionResult>
  saveCheckout: (
    storeId: string,
    pageId: string,
    input: PageCheckoutInput
  ) => Promise<OfferActionResult>
  /**
   * Fired after the server accepts a change, so the canvas can recompile.
   *
   * Sections read their prices from the page's offers rather than from their
   * own settings — which is the point — so nothing about a section's content
   * changes when an offer is created, and without this signal the preview goes
   * on showing whatever it compiled before.
   */
  onOffersChange?: () => void
}

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

export function blankOffer(): OfferDraft {
  return {
    id: null,
    label: '',
    description: '',
    badge: '',
    kind: 'FIXED',
    pricingMode: 'AUTO',
    price: '',
    discountPercent: '',
    compareAt: '',
    minQuantity: '',
    maxQuantity: '',
    isDefault: false,
    isActive: true,
    items: [],
    tiers: [],
  }
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

function draftToInput(draft: OfferDraft, currencyCode: string): OfferInput {
  return {
    label: draft.label.trim() || 'Offer',
    description: draft.description.trim() || null,
    badge: draft.badge.trim() || null,
    kind: draft.kind,
    pricingMode: draft.pricingMode,
    priceCents: toCents(draft.price, currencyCode),
    discountBps: Math.round(Number(draft.discountPercent || 0) * 100) || 0,
    compareAtCents: toCents(draft.compareAt, currencyCode),
    minQuantity: toInt(draft.minQuantity),
    maxQuantity: toInt(draft.maxQuantity),
    isDefault: draft.isDefault,
    isActive: draft.isActive,
    items: draft.items,
    tiers: draft.tiers
      .filter((tier) => toInt(tier.quantity) > 0)
      .map((tier) => ({
        quantity: toInt(tier.quantity),
        priceCents: toCents(tier.price, currencyCode),
      })),
  }
}

export function OffersPanel({
  storeId,
  pageId,
  products,
  currencyCode,
  initialOffers,
  initialCheckout,
  saveOffer,
  deleteOffer,
  saveCheckout,
  onOffersChange,
}: OffersPanelProps) {
  const [offers, setOffers] = useState(initialOffers)
  const [editing, setEditing] = useState<OfferDraft | null>(null)
  const [checkout, setCheckout] = useState(initialCheckout)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function persist(draft: OfferDraft) {
    setError(null)
    startTransition(async () => {
      const result = await saveOffer(
        storeId,
        pageId,
        draft.id,
        draftToInput(draft, currencyCode)
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOffers((prev) => {
        const next = draft.id
          ? prev.map((offer) => (offer.id === draft.id ? draft : offer))
          : [...prev, draft]
        // Exactly one default, mirrored from what the server just enforced.
        return draft.isDefault
          ? next.map((offer) => ({
              ...offer,
              isDefault: offer === draft || offer.id === draft.id,
            }))
          : next
      })
      setEditing(null)
      onOffersChange?.()
    })
  }

  function remove(offer: OfferDraft) {
    if (!offer.id) return
    setError(null)
    startTransition(async () => {
      const result = await deleteOffer(storeId, pageId, offer.id!)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOffers((prev) => prev.filter((candidate) => candidate.id !== offer.id))
      onOffersChange?.()
    })
  }

  function persistCheckout(next: CheckoutDraft) {
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
      // Delivery rates and promotions are in the same scope the sections read,
      // so a "free delivery over ৳2000" strip has to recompile too.
      onOffersChange?.()
    })
  }

  if (editing) {
    return (
      <OfferEditor
        draft={editing}
        products={products}
        currencyCode={currencyCode}
        pending={pending}
        error={error}
        onChange={setEditing}
        onCancel={() => {
          setEditing(null)
          setError(null)
        }}
        onSave={persist}
      />
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Offers</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(blankOffer())}
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>

        {offers.length === 0 && (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
            This page cannot take orders yet. An offer is what the order form
            sells — one product, or a bundle at your own price.
          </p>
        )}

        <ul className="space-y-1.5">
          {offers.map((offer) => (
            <li
              key={offer.id ?? offer.label}
              className="hover:bg-accent/40 flex items-center gap-2 rounded-lg border p-2"
            >
              <GripVertical className="text-muted-foreground size-3.5 shrink-0" />
              <button
                type="button"
                onClick={() => setEditing(offer)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-xs font-medium">
                  {offer.label || 'Untitled offer'}
                  {offer.isDefault && (
                    <span className="text-muted-foreground ml-1.5 text-[10px] font-normal">
                      default
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground block text-[11px]">
                  {offer.kind === 'FIXED'
                    ? `${offer.items.length} product${offer.items.length === 1 ? '' : 's'}`
                    : `${offer.kind === 'COLLECTION' ? 'Mix & match' : 'À la carte'} · ${offer.items.length} in pool`}
                  {!offer.isActive && ' · hidden'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(offer)}
                className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                aria-label="Delete offer"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <DeliveryEditor
        checkout={checkout}
        currencyCode={currencyCode}
        onChange={persistCheckout}
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

function OfferEditor({
  draft,
  products,
  currencyCode,
  pending,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: OfferDraft
  products: OfferProduct[]
  currencyCode: string
  pending: boolean
  error: string | null
  onChange: (next: OfferDraft) => void
  onCancel: () => void
  onSave: (draft: OfferDraft) => void
}) {
  const set = <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) =>
    onChange({ ...draft, [key]: value })

  const isPool = draft.kind !== 'FIXED'

  // What the chosen products list for, so the merchant sees the discount they
  // are actually giving rather than guessing at it.
  const regularCents = draft.items.reduce((total, item) => {
    const product = products.find(
      (candidate) => candidate.id === item.productId
    )
    const variant = item.variantId
      ? product?.variants.find((candidate) => candidate.id === item.variantId)
      : product?.variants[0]
    return total + (variant?.priceCents ?? 0) * (item.quantity || 1)
  }, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {draft.id ? 'Edit offer' : 'New offer'}
        </h3>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <Row label="Name">
        <Input
          value={draft.label}
          placeholder="২টি কম্বো"
          onChange={(event) => set('label', event.target.value)}
        />
      </Row>

      <Row label="Badge">
        <Input
          value={draft.badge}
          placeholder="সবচেয়ে জনপ্রিয়"
          onChange={(event) => set('badge', event.target.value)}
        />
      </Row>

      <Row label="Description">
        <Textarea
          rows={2}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </Row>

      <Row label="Type">
        <select
          value={draft.kind}
          onChange={(event) =>
            set('kind', event.target.value as OfferDraft['kind'])
          }
          className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="FIXED">Fixed set — exactly these products</option>
          <option value="COLLECTION">
            Mix &amp; match — price by quantity
          </option>
          <option value="ALACARTE">À la carte — each at its own price</option>
        </select>
      </Row>

      <ProductPicker
        products={products}
        items={draft.items}
        showQuantity={!isPool}
        currencyCode={currencyCode}
        onChange={(items) => set('items', items)}
      />

      {draft.kind === 'COLLECTION' ? (
        <TierEditor
          tiers={draft.tiers}
          currencyCode={currencyCode}
          onChange={(tiers) => set('tiers', tiers)}
        />
      ) : (
        <>
          <Row label="Pricing">
            <select
              value={draft.pricingMode}
              onChange={(event) =>
                set(
                  'pricingMode',
                  event.target.value as OfferDraft['pricingMode']
                )
              }
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="AUTO">Regular price</option>
              {draft.kind === 'FIXED' && (
                <option value="FIXED">Fixed total for the bundle</option>
              )}
              <option value="PERCENT">Percentage off</option>
              <option value="AMOUNT">Amount off</option>
            </select>
          </Row>

          {draft.pricingMode === 'PERCENT' && (
            <Row label="Discount %">
              <Input
                inputMode="decimal"
                value={draft.discountPercent}
                onChange={(event) => set('discountPercent', event.target.value)}
              />
            </Row>
          )}

          {(draft.pricingMode === 'FIXED' ||
            draft.pricingMode === 'AMOUNT') && (
            <Row
              label={
                draft.pricingMode === 'FIXED' ? 'Bundle price' : 'Amount off'
              }
            >
              <Input
                inputMode="decimal"
                value={draft.price}
                onChange={(event) => set('price', event.target.value)}
              />
            </Row>
          )}

          {regularCents > 0 && (
            <p className="text-muted-foreground text-[11px]">
              Regular total {formatMoney(regularCents, currencyCode)}
            </p>
          )}
        </>
      )}

      {isPool && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Min items">
            <Input
              inputMode="numeric"
              value={draft.minQuantity}
              onChange={(event) => set('minQuantity', event.target.value)}
            />
          </Row>
          <Row label="Max items">
            <Input
              inputMode="numeric"
              value={draft.maxQuantity}
              onChange={(event) => set('maxQuantity', event.target.value)}
            />
          </Row>
        </div>
      )}

      <Row label="Compare-at price">
        <Input
          inputMode="decimal"
          placeholder="Blank = the regular total"
          value={draft.compareAt}
          onChange={(event) => set('compareAt', event.target.value)}
        />
      </Row>

      <Toggle
        label="Preselect this offer"
        checked={draft.isDefault}
        onChange={(value) => set('isDefault', value)}
      />
      <Toggle
        label="Show on the page"
        checked={draft.isActive}
        onChange={(value) => set('isActive', value)}
      />

      {error && <p className="text-destructive text-xs">{error}</p>}

      <Button
        type="button"
        className="w-full"
        disabled={pending || draft.items.length === 0}
        onClick={() => onSave(draft)}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {draft.id ? 'Save offer' : 'Create offer'}
      </Button>
      {draft.items.length === 0 && (
        <p className="text-muted-foreground text-[11px]">
          Add at least one product.
        </p>
      )}
    </div>
  )
}

function ProductPicker({
  products,
  items,
  showQuantity,
  currencyCode,
  onChange,
}: {
  products: OfferProduct[]
  items: OfferDraft['items']
  showQuantity: boolean
  currencyCode: string
  onChange: (items: OfferDraft['items']) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Products</Label>

      {items.map((item, index) => {
        const product = products.find(
          (candidate) => candidate.id === item.productId
        )
        return (
          <div
            key={index}
            className="flex items-center gap-1.5 rounded-lg border p-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-xs">
              {product?.title ?? 'Unknown product'}
            </span>

            {product && product.variants.length > 1 && (
              <select
                value={item.variantId ?? ''}
                onChange={(event) =>
                  onChange(
                    items.map((candidate, position) =>
                      position === index
                        ? {
                            ...candidate,
                            variantId: event.target.value || null,
                          }
                        : candidate
                    )
                  )
                }
                className="border-input h-7 max-w-[110px] rounded border bg-transparent px-1 text-[11px]"
              >
                <option value="">Buyer picks</option>
                {product.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.title} ·{' '}
                    {formatMoneyAmount(variant.priceCents, currencyCode)}
                  </option>
                ))}
              </select>
            )}

            {showQuantity && (
              <Input
                inputMode="numeric"
                value={String(item.quantity)}
                onChange={(event) =>
                  onChange(
                    items.map((candidate, position) =>
                      position === index
                        ? {
                            ...candidate,
                            quantity: Math.max(
                              1,
                              Number(event.target.value) || 1
                            ),
                          }
                        : candidate
                    )
                  )
                }
                className="h-7 w-12 px-1 text-center text-[11px]"
              />
            )}

            <button
              type="button"
              onClick={() =>
                onChange(items.filter((_, position) => position !== index))
              }
              className="text-muted-foreground hover:text-destructive p-1"
              aria-label="Remove product"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )
      })}

      <select
        value=""
        onChange={(event) => {
          if (!event.target.value) return
          onChange([
            ...items,
            { productId: event.target.value, variantId: null, quantity: 1 },
          ])
        }}
        className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="">Add a product…</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.title}
          </option>
        ))}
      </select>

      {products.length === 0 && (
        <p className="text-muted-foreground text-[11px]">
          No active products in this workspace yet.
        </p>
      )}
    </div>
  )
}

/**
 * The quantity→price ladder.
 *
 * Every rung is typed by hand because that is the mechanic: "any 3 for ৳2500"
 * is a number the merchant negotiated, not one derived from a unit price. A
 * quantity with no rung simply cannot be ordered, which is deliberate — see
 * tierPriceFor.
 */
function TierEditor({
  tiers,
  currencyCode,
  onChange,
}: {
  tiers: OfferDraft['tiers']
  currencyCode: string
  onChange: (tiers: OfferDraft['tiers']) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Price ladder ({currencyCode})</Label>
      {tiers.map((tier, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            inputMode="numeric"
            placeholder="Qty"
            value={tier.quantity}
            onChange={(event) =>
              onChange(
                tiers.map((candidate, position) =>
                  position === index
                    ? { ...candidate, quantity: event.target.value }
                    : candidate
                )
              )
            }
            className="h-8 w-16 text-xs"
          />
          <span className="text-muted-foreground text-xs">for</span>
          <Input
            inputMode="decimal"
            placeholder="Price"
            value={tier.price}
            onChange={(event) =>
              onChange(
                tiers.map((candidate, position) =>
                  position === index
                    ? { ...candidate, price: event.target.value }
                    : candidate
                )
              )
            }
            className="h-8 flex-1 text-xs"
          />
          <button
            type="button"
            onClick={() =>
              onChange(tiers.filter((_, position) => position !== index))
            }
            className="text-muted-foreground hover:text-destructive p-1"
            aria-label="Remove rung"
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
        onClick={() => onChange([...tiers, { quantity: '', price: '' }])}
      >
        <Plus className="size-3" /> Add a rung
      </Button>
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
        <select
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
        </select>
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
