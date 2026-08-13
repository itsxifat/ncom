'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, Loader2, GripVertical, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { formatMoney, formatMoneyAmount, minorUnitsPerMajor } from '@/lib/money'
import type {
  OfferProduct,
  PickerProduct,
} from '@/server/services/productService'
import { ProductPickerDialog } from '@/components/store/product-picker'
import type {
  OfferInput,
  PageCheckoutInput,
} from '@/server/services/offerAdminService'
import type {
  CheckoutActionResult,
  OfferActionResult,
} from '@/app/(dashboard)/stores/[storeId]/pages/[pageId]/edit/offer-actions'
import { toOfferDrafts } from './offer-drafts'
import { FormSelect } from '@/components/ui/form-select'
import { cn } from '@/lib/utils'

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
  /**
   * The same catalogue with photos, prices and stock. Kept alongside `products`
   * rather than replacing it because an offer stores product and variant ids
   * and needs the grouped shape to resolve them — this is what the *picker*
   * renders, which is a different question from what the offer stores.
   */
  pickerProducts?: PickerProduct[]
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
  /** Persists the order the offers were dragged into. */
  reorderOffers: (
    storeId: string,
    pageId: string,
    orderedIds: string[]
  ) => Promise<OfferActionResult>
  saveCheckout: (
    storeId: string,
    pageId: string,
    input: PageCheckoutInput
  ) => Promise<CheckoutActionResult>
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

/**
 * An offer's product, from whichever catalogue happens to hold it.
 *
 * There are two: `products` is every *active* product, `pickerProducts` is what
 * the picker dialog just offered — which includes drafts, because building the
 * page before publishing the product is the normal order of work. A product
 * added from the picker but missing from the active list used to render as
 * "Unknown product" with no variant dropdown, so the merchant could not pin a
 * size on the very product they had just chosen.
 */
function resolveProduct(
  productId: string,
  products: OfferProduct[],
  pickerProducts: PickerProduct[]
): OfferProduct | undefined {
  const active = products.find((candidate) => candidate.id === productId)
  if (active) return active

  const drafted = pickerProducts.find((candidate) => candidate.id === productId)
  if (!drafted) return undefined

  return {
    id: drafted.id,
    title: drafted.title,
    imageUrl: drafted.imageUrl,
    variants: drafted.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      priceCents: variant.priceCents,
    })),
  }
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
    // A rung with no price would sell that many pieces for nothing. It is
    // always a half-finished row rather than a giveaway, so it is dropped:
    // the quantity then simply cannot be ordered, which is the safe reading.
    tiers: draft.tiers
      .map((tier) => ({
        quantity: toInt(tier.quantity),
        priceCents: toCents(tier.price, currencyCode),
      }))
      .filter((tier) => tier.quantity > 0 && tier.priceCents > 0),
  }
}

export function OffersPanel({
  storeId,
  pageId,
  products,
  pickerProducts = [],
  currencyCode,
  initialOffers,
  initialCheckout,
  saveOffer,
  deleteOffer,
  reorderOffers,
  saveCheckout,
  onOffersChange,
}: OffersPanelProps) {
  const [offers, setOffers] = useState(initialOffers)
  const [editing, setEditing] = useState<OfferDraft | null>(null)
  const [checkout, setCheckout] = useState(initialCheckout)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  /**
   * The list is replaced by the server's answer rather than patched locally.
   *
   * A created offer has no id until the server assigns one, and an offer edited
   * from a draft with a null id is saved as a *new* offer — which is how editing
   * a just-created bundle used to duplicate it. Taking the server's list back
   * closes that hole and keeps positions and the single preselected offer honest
   * at the same time.
   */
  function adopt(result: OfferActionResult): boolean {
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setOffers(toOfferDrafts(result.offers, currencyCode))
    onOffersChange?.()
    return true
  }

  function persist(draft: OfferDraft) {
    setError(null)
    startTransition(async () => {
      const result = await saveOffer(
        storeId,
        pageId,
        draft.id,
        draftToInput(draft, currencyCode)
      )
      if (adopt(result)) setEditing(null)
    })
  }

  function remove(offer: OfferDraft) {
    if (!offer.id) return
    setError(null)
    startTransition(async () => {
      adopt(await deleteOffer(storeId, pageId, offer.id!))
    })
  }

  /**
   * Reorders locally first, then persists.
   *
   * A drag that snaps back while a round trip finishes reads as a failed drag,
   * so the list moves immediately and only reverts if the server refuses.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = offers.findIndex((offer) => offer.id === active.id)
    const to = offers.findIndex((offer) => offer.id === over.id)
    if (from === -1 || to === -1) return

    const previous = offers
    const next = arrayMove(offers, from, to)
    setOffers(next)
    setError(null)

    startTransition(async () => {
      const result = await reorderOffers(
        storeId,
        pageId,
        next.map((offer) => offer.id).filter((id): id is string => Boolean(id))
      )
      if (result.ok) adopt(result)
      else {
        setOffers(previous)
        setError(result.error)
      }
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
        pickerProducts={pickerProducts}
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

        {/* The buyer sees the offers in this order, so dragging them is a
            merchandising decision — the cheapest first, or the one being pushed
            in the middle. */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={offers.map((offer) => offer.id ?? offer.label)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1.5">
              {offers.map((offer) => (
                <OfferRow
                  key={offer.id ?? offer.label}
                  offer={offer}
                  onEdit={() => setEditing(offer)}
                  onDelete={() => remove(offer)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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

/**
 * One offer in the list: a drag handle, the summary, and the two things a
 * merchant does to it.
 *
 * The handle is a separate button rather than the whole row being draggable,
 * because the row's main job is to open the editor and a click that sometimes
 * drags instead is how a list like this becomes frustrating to use.
 */
function OfferRow({
  offer,
  onEdit,
  onDelete,
}: {
  offer: OfferDraft
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: offer.id ?? offer.label })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'hover:bg-accent/40 flex items-center gap-2 rounded-lg border p-2',
        isDragging && 'opacity-50'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Reorder ${offer.label || 'offer'}`}
      >
        <GripVertical className="size-3.5" />
      </button>

      <button
        type="button"
        onClick={onEdit}
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
        onClick={onEdit}
        className="text-muted-foreground hover:text-foreground shrink-0 p-1"
        aria-label={`Edit ${offer.label || 'offer'}`}
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive shrink-0 p-1"
        aria-label={`Delete ${offer.label || 'offer'}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  )
}

function OfferEditor({
  draft,
  products,
  pickerProducts,
  currencyCode,
  pending,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: OfferDraft
  products: OfferProduct[]
  pickerProducts: PickerProduct[]
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
    const product = resolveProduct(item.productId, products, pickerProducts)
    const variant = item.variantId
      ? product?.variants.find((candidate) => candidate.id === item.variantId)
      : product?.variants[0]
    return total + (variant?.priceCents ?? 0) * (item.quantity || 1)
  }, 0)

  // A line the buyer chooses the variant on can be worth different amounts, so
  // the total above is the cheapest reading of the offer rather than the only
  // one. Saying so beats quoting a single number that a Large breaks.
  const regularVaries = draft.items.some((item) => {
    if (item.variantId) return false
    const product = resolveProduct(item.productId, products, pickerProducts)
    return (
      new Set(product?.variants.map((variant) => variant.priceCents)).size > 1
    )
  })

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
        <FormSelect
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
        </FormSelect>
      </Row>

      <ProductPicker
        products={products}
        pickerProducts={pickerProducts}
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
            <FormSelect
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
            </FormSelect>
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
              Regular total {regularVaries && 'from '}
              {formatMoney(regularCents, currencyCode)}
              {regularVaries && ' — varies with the variant the buyer picks'}
            </p>
          )}
        </>
      )}

      {/* À la carte only. A mix & match offer is bounded by its ladder — the
          buyer may take any quantity that has a rung and no other — so a min
          and a max here would be two controls quietly contradicting a third. */}
      {draft.kind === 'ALACARTE' && (
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
  pickerProducts,
  items,
  showQuantity,
  currencyCode,
  onChange,
}: {
  products: OfferProduct[]
  pickerProducts: PickerProduct[]
  items: OfferDraft['items']
  showQuantity: boolean
  currencyCode: string
  onChange: (items: OfferDraft['items']) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Products</Label>

      {items.map((item, index) => {
        const product = resolveProduct(item.productId, products, pickerProducts)
        const details = pickerProducts.find(
          (candidate) => candidate.id === item.productId
        )
        return (
          <div
            key={index}
            className="flex items-center gap-1.5 rounded-lg border p-1.5"
          >
            {/* The photo is what tells two similarly-named products apart at a
                glance in a panel this narrow. */}
            <div className="bg-muted size-7 shrink-0 overflow-hidden rounded">
              {details?.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
                <img
                  src={details.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                />
              )}
            </div>

            <span className="min-w-0 flex-1 truncate text-xs">
              {product?.title ?? 'Unknown product'}
              {details?.tracksInventory && details.available <= 0 && (
                <span className="text-destructive"> · out of stock</span>
              )}
            </span>

            {product && product.variants.length > 1 && (
              <FormSelect
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
              </FormSelect>
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

      <ProductPickerDialog
        initialProducts={pickerProducts}
        currencyCode={currencyCode}
        title="Add a product to this offer"
        onPick={(productId) =>
          onChange([...items, { productId, variantId: null, quantity: 1 }])
        }
        trigger={
          <Button type="button" variant="outline" size="sm" className="w-full">
            <Plus className="size-3.5" />
            Add a product
          </Button>
        }
      />

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
 *
 * Which makes the ladder the offer's real limit, and that has to be visible:
 * a merchant who priced two pieces and set "max 12" elsewhere was told the
 * buyer could take twelve while the form stopped them at two. So the rungs are
 * listed back in plain words, and "allow up to N" extends the ladder rather
 * than pretending a limit exists outside it — filling the missing rungs at the
 * best rate already on the ladder, as a starting point to edit, so no price is
 * ever charged that the merchant did not see.
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
  const priced = tiers
    .map((tier) => ({
      quantity: toInt(tier.quantity),
      price: Number(String(tier.price).replace(/[^0-9.]/g, '')),
    }))
    .filter((tier) => tier.quantity > 0)
    .sort((a, b) => a.quantity - b.quantity)

  const largest = priced.length > 0 ? priced[priced.length - 1].quantity : 0
  const [target, setTarget] = useState('')

  /** The cheapest per-piece rate the merchant has already agreed to. */
  const bestUnitPrice = priced.reduce((best, tier) => {
    if (!tier.price || tier.price <= 0) return best
    const unit = tier.price / tier.quantity
    return best === 0 ? unit : Math.min(best, unit)
  }, 0)

  function fillUpTo(upTo: number) {
    const taken = new Set(priced.map((tier) => tier.quantity))
    const start = priced.length > 0 ? priced[0].quantity : 1
    const added: OfferDraft['tiers'] = []

    for (let quantity = start; quantity <= upTo; quantity++) {
      if (taken.has(quantity)) continue
      added.push({
        quantity: String(quantity),
        // Blank when there is nothing to extrapolate from, so the merchant
        // fills it in rather than the rung shipping at some invented number.
        price:
          bestUnitPrice > 0 ? String(Math.round(bestUnitPrice * quantity)) : '',
      })
    }

    if (added.length === 0) return
    onChange(
      [...tiers, ...added].sort((a, b) => toInt(a.quantity) - toInt(b.quantity))
    )
    setTarget('')
  }

  // Only a rung with a price is a rung; the rest are dropped on save, so they
  // must not appear in the promise made to the merchant either.
  const sellable = priced.filter((tier) => tier.price > 0)
  const unpriced = priced.length - sellable.length

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Price ladder ({currencyCode})</Label>
      <p className="text-muted-foreground text-[11px]">
        {sellable.length === 0
          ? 'Add a rung for every quantity you will sell. A quantity with no rung cannot be ordered.'
          : `Buyers can take ${listQuantities(sellable.map((tier) => tier.quantity))} — nothing else.`}
        {unpriced > 0 &&
          ` ${unpriced} rung${unpriced === 1 ? '' : 's'} without a price will not be saved.`}
      </p>
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

      <div className="flex items-center gap-1.5 border-t pt-2">
        <span className="text-muted-foreground text-[11px]">Allow up to</span>
        <Input
          inputMode="numeric"
          placeholder={String(Math.max(2, largest + 1))}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="h-8 w-14 text-center text-xs"
        />
        <span className="text-muted-foreground text-[11px]">items</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={toInt(target) <= largest}
          onClick={() => fillUpTo(toInt(target))}
        >
          Add the rungs
        </Button>
      </div>
      {toInt(target) > largest && (
        <p className="text-muted-foreground text-[11px]">
          Adds a rung for every quantity up to {toInt(target)}
          {bestUnitPrice > 0
            ? `, priced at your best rate of ${formatMoney(
                Math.round(bestUnitPrice * minorUnitsPerMajor(currencyCode)),
                currencyCode
              )} each. Edit any of them.`
            : '. Type a price for each.'}
        </p>
      )}
    </div>
  )
}

/** "2, 3 or 12 items" — the ladder read back as the buyer will meet it. */
function listQuantities(quantities: number[]): string {
  const unique = [...new Set(quantities)].sort((a, b) => a - b)
  if (unique.length === 1) return `exactly ${unique[0]} items`

  // A run with no gaps is a range; anything else has to be spelled out, because
  // "2–12" would promise seven quantities that cannot be ordered.
  const contiguous = unique.every(
    (quantity, index) => index === 0 || quantity === unique[index - 1] + 1
  )
  if (contiguous) return `${unique[0]}–${unique[unique.length - 1]} items`

  const last = unique[unique.length - 1]
  return `${unique.slice(0, -1).join(', ')} or ${last} items`
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
