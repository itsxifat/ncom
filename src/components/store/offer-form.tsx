'use client'

import { useActionState, useCallback, useMemo, useState } from 'react'
import { Gift, Package, Plus, Trash2 } from 'lucide-react'
import {
  saveOfferAction,
  type OfferActionState,
} from '@/app/(dashboard)/discounts/offer-actions'
import type { PickerProduct } from '@/server/services/productService'
import { ProductPickerDialog } from '@/components/store/product-picker'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect, MoneyInput } from '@/components/store/form-controls'
import { formatMoneyAmount } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * The offer editor.
 *
 * An offer is what a landing page's order form actually sells: a bundle, a
 * mix-and-match ladder, or a pool priced piece by piece. It used to be edited
 * inside one page's builder, which made it impossible to express the thing
 * merchants asked for most — the same bundle running across every campaign page
 * of a shop, or across every shop. Scope is therefore the first decision on this
 * form rather than an afterthought.
 *
 * The other thing this form exists to make sayable is per-size terms. A shirt
 * at 450/500/550 by size is one product with three prices, and "20% off shirts,
 * but not the XL" previously had no expression at all. Each product's sizes are
 * listed with their own row, so excluding one or pricing it differently is two
 * clicks rather than a second product.
 *
 * Money stays as the text the merchant typed and is converted once, on the
 * server. A controlled numeric input that reformats mid-keystroke is unusable.
 */

export interface OfferFormTier {
  quantity: string
  reward: 'PRICE' | 'PERCENT'
  price: string
  discountPercent: string
}

export interface OfferFormItem {
  productId: string
  variantId: string | null
  /** Which sizes this line covers. Empty means all of them. */
  variantIds: string[]
  quantity: number
}

export interface OfferFormRule {
  variantId: string
  excluded: boolean
  pricingMode: 'AUTO' | 'FIXED' | 'PERCENT' | 'AMOUNT' | null
  price: string
  discountPercent: string
}

export interface OfferFormInitial {
  id?: string
  label: string
  description: string
  badge: string
  scope: 'PAGE' | 'STORE' | 'ORGANIZATION'
  storeId: string
  pageId: string
  kind: 'FIXED' | 'COLLECTION' | 'ALACARTE'
  pricingMode: 'AUTO' | 'FIXED' | 'PERCENT' | 'AMOUNT'
  price: string
  discountPercent: string
  compareAt: string
  minQuantity: string
  maxQuantity: string
  tierMode: 'EXACT' | 'THRESHOLD'
  tiers: OfferFormTier[]
  items: OfferFormItem[]
  variantRules: OfferFormRule[]
  giftVariantId: string
  giftQuantity: string
  startsAt: string
  endsAt: string
  isDefault: boolean
  isActive: boolean
}

export interface OfferFormStore {
  id: string
  name: string
  pages: { id: string; title: string }[]
}

export function OfferForm({
  currencyCode,
  initial,
  products,
  productsCursor = null,
  productsTotal = null,
  stores,
}: {
  currencyCode: string
  initial: OfferFormInitial
  /** The first page of the catalogue, plus whatever this offer already holds. */
  products: PickerProduct[]
  /** Where the picker's next page starts, for catalogues bigger than a page. */
  productsCursor?: string | null
  productsTotal?: number | null
  stores: OfferFormStore[]
}) {
  const boundAction = saveOfferAction.bind(null, initial.id ?? null)
  const [state, action, pending] = useActionState<OfferActionState, FormData>(
    boundAction,
    undefined
  )

  const [form, setForm] = useState(initial)
  const set = <K extends keyof OfferFormInitial>(
    key: K,
    value: OfferFormInitial[K]
  ) => setForm((current) => ({ ...current, [key]: value }))

  const payload = useMemo(() => JSON.stringify(form), [form])

  // Products the merchant reached by scrolling the picker past its first page.
  // The rest of this form — the size rules, the gift list, the row that names
  // what was chosen — resolves ids out of one catalogue, and a product picked
  // from page four is not in the page the server sent.
  const [found, setFound] = useState<PickerProduct[]>([])
  const remember = useCallback((product: PickerProduct) => {
    setFound((current) =>
      current.some((seen) => seen.id === product.id)
        ? current
        : [...current, product]
    )
  }, [])

  const catalog = useMemo(() => {
    const onPage = new Set(products.map((product) => product.id))
    return [...products, ...found.filter((product) => !onPage.has(product.id))]
  }, [products, found])

  const byId = useMemo(
    () => new Map(catalog.map((product) => [product.id, product])),
    [catalog]
  )

  const isPool = form.kind !== 'FIXED'
  const isLadder = form.kind === 'COLLECTION'

  /** Every variant currently inside the offer, for the gift and rule pickers. */
  const chosenVariants = useMemo(() => {
    const out: { id: string; label: string; priceCents: number }[] = []
    for (const item of form.items) {
      const product = byId.get(item.productId)
      if (!product) continue
      for (const variant of product.variants) {
        if (item.variantId && variant.id !== item.variantId) continue
        if (
          !item.variantId &&
          item.variantIds.length > 0 &&
          !item.variantIds.includes(variant.id)
        ) {
          continue
        }
        out.push({
          id: variant.id,
          label: `${product.title} · ${variant.title}`,
          priceCents: variant.priceCents,
        })
      }
    }
    return out
  }, [form.items, byId])

  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />

      <SettingsSection
        title="Offer"
        description="What the buyer sees on the card, and where it runs."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="offer-label">Name</FieldLabel>
            <Input
              id="offer-label"
              value={form.label}
              onChange={(event) => set('label', event.target.value)}
              placeholder="২টি কম্বো"
              required
            />
            <FieldDescription>
              Shown on the package card the buyer chooses between.
            </FieldDescription>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="offer-badge">Badge</FieldLabel>
              <Input
                id="offer-badge"
                value={form.badge}
                onChange={(event) => set('badge', event.target.value)}
                placeholder="সবচেয়ে জনপ্রিয়"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="offer-compare">Compare-at price</FieldLabel>
              <MoneyInput
                id="offer-compare"
                currencyCode={currencyCode}
                value={form.compareAt}
                onChange={(event) => set('compareAt', event.target.value)}
                placeholder="Blank = the regular total"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="offer-description">Description</FieldLabel>
            <Textarea
              id="offer-description"
              rows={2}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>

          <ScopePicker
            scope={form.scope}
            storeId={form.storeId}
            pageId={form.pageId}
            stores={stores}
            onChange={(next) => setForm((current) => ({ ...current, ...next }))}
          />
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="How it is sold"
        description="A fixed set, a mix-and-match ladder, or a pool priced piece by piece."
      >
        <FieldGroup>
          <Field>
            <FormSelect
              aria-label="Offer type"
              value={form.kind}
              onChange={(event) =>
                set('kind', event.target.value as OfferFormInitial['kind'])
              }
            >
              <option value="FIXED">Fixed set — exactly these products</option>
              <option value="COLLECTION">
                Mix &amp; match — price by quantity
              </option>
              <option value="ALACARTE">
                À la carte — each at its own price
              </option>
            </FormSelect>
            <FieldDescription>
              {form.kind === 'FIXED'
                ? 'The buyer gets everything below. One price for the set.'
                : form.kind === 'COLLECTION'
                  ? 'The buyer picks from the pool below; the quantity sets the price.'
                  : 'The buyer picks from the pool below; each piece is charged at its own price.'}
            </FieldDescription>
          </Field>

          {isPool && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* A ladder's bounds come from the ladder, and saying so is the
                  whole job of these two fields on a mix-and-match offer. The
                  lowest rung is the minimum in both modes — `quantityBounds`
                  never reads `minQuantity` for a COLLECTION — and an exact
                  ladder's top rung is its maximum, so a number typed in either
                  box used to be accepted, saved and then silently ignored. */}
              <Field>
                <FieldLabel htmlFor="offer-min">Minimum items</FieldLabel>
                <Input
                  id="offer-min"
                  inputMode="numeric"
                  value={form.minQuantity}
                  onChange={(event) => set('minQuantity', event.target.value)}
                  placeholder={isLadder ? 'From the ladder' : '1'}
                  disabled={isLadder}
                />
                {isLadder && (
                  <FieldDescription>
                    The lowest rung below sets this.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="offer-max">Maximum items</FieldLabel>
                <Input
                  id="offer-max"
                  inputMode="numeric"
                  value={form.maxQuantity}
                  onChange={(event) => set('maxQuantity', event.target.value)}
                  placeholder={
                    isLadder && form.tierMode === 'EXACT'
                      ? 'From the ladder'
                      : 'No limit'
                  }
                  disabled={isLadder && form.tierMode === 'EXACT'}
                />
                {isLadder && form.tierMode === 'EXACT' && (
                  <FieldDescription>
                    The highest rung below sets this — an exact ladder sells
                    nothing it has not priced.
                  </FieldDescription>
                )}
              </Field>
            </div>
          )}
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title={isPool ? 'The pool' : 'The set'}
        description={
          isPool
            ? 'What the buyer may choose from. Narrow a product to certain sizes if the offer does not cover all of them.'
            : 'Exactly what the buyer gets, and how many of each.'
        }
      >
        <ItemEditor
          items={form.items}
          products={catalog}
          productsCursor={productsCursor}
          productsTotal={productsTotal}
          onFound={remember}
          currencyCode={currencyCode}
          showQuantity={!isPool}
          onChange={(items) => set('items', items)}
        />
      </SettingsSection>

      {isLadder ? (
        <SettingsSection
          title="Price ladder"
          description="What each quantity costs. This is the whole price of a mix-and-match offer."
        >
          <TierEditor
            tiers={form.tiers}
            tierMode={form.tierMode}
            currencyCode={currencyCode}
            onTiers={(tiers) => set('tiers', tiers)}
            onMode={(tierMode) => set('tierMode', tierMode)}
          />
        </SettingsSection>
      ) : (
        <SettingsSection
          title="Pricing"
          description="What the offer charges against what the goods list for."
        >
          <FieldGroup>
            <Field>
              <FormSelect
                aria-label="Pricing"
                value={form.pricingMode}
                onChange={(event) =>
                  set(
                    'pricingMode',
                    event.target.value as OfferFormInitial['pricingMode']
                  )
                }
              >
                <option value="AUTO">Regular price — no discount</option>
                {form.kind === 'FIXED' && (
                  <option value="FIXED">One price for the whole set</option>
                )}
                <option value="PERCENT">Percentage off</option>
                <option value="AMOUNT">Amount off</option>
              </FormSelect>
            </Field>

            {form.pricingMode === 'PERCENT' && (
              <Field>
                <FieldLabel htmlFor="offer-percent">Discount %</FieldLabel>
                <Input
                  id="offer-percent"
                  inputMode="decimal"
                  value={form.discountPercent}
                  onChange={(event) =>
                    set('discountPercent', event.target.value)
                  }
                  placeholder="20"
                />
              </Field>
            )}

            {(form.pricingMode === 'FIXED' ||
              form.pricingMode === 'AMOUNT') && (
              <Field>
                <FieldLabel htmlFor="offer-price">
                  {form.pricingMode === 'FIXED' ? 'Set price' : 'Amount off'}
                </FieldLabel>
                <MoneyInput
                  id="offer-price"
                  currencyCode={currencyCode}
                  value={form.price}
                  onChange={(event) => set('price', event.target.value)}
                />
              </Field>
            )}
          </FieldGroup>
        </SettingsSection>
      )}

      <SettingsSection
        title="Sizes on their own terms"
        description="Leave a size out of the offer, or give it a different rate. Everything not listed here follows the offer."
      >
        <VariantRuleEditor
          items={form.items}
          products={catalog}
          rules={form.variantRules}
          currencyCode={currencyCode}
          offerPrices={!isLadder}
          onChange={(variantRules) => set('variantRules', variantRules)}
        />
      </SettingsSection>

      <SettingsSection
        title="Free gift"
        description="Thrown in with the offer. It is packed and its stock moves like anything else — the customer just is not charged for it."
      >
        <FieldGroup>
          <Field>
            <FormSelect
              aria-label="Gift"
              value={form.giftVariantId}
              onChange={(event) => set('giftVariantId', event.target.value)}
            >
              <option value="">No gift</option>
              {chosenVariants.length === 0 && (
                <option value="" disabled>
                  Add a product first
                </option>
              )}
              {chosenVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label} ·{' '}
                  {formatMoneyAmount(variant.priceCents, currencyCode)}
                </option>
              ))}
            </FormSelect>
            <FieldDescription>
              Anything in this offer can be the gift. Pick from the products
              above.
            </FieldDescription>
          </Field>

          {form.giftVariantId && (
            <Field>
              <FieldLabel htmlFor="offer-gift-qty">How many</FieldLabel>
              <Input
                id="offer-gift-qty"
                inputMode="numeric"
                value={form.giftQuantity}
                onChange={(event) => set('giftQuantity', event.target.value)}
                placeholder="1"
                className="max-w-24"
              />
            </Field>
          )}
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="When it runs"
        description="Leave both blank to run it until you pause it."
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="offer-starts">Starts</FieldLabel>
              <Input
                id="offer-starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="offer-ends">Ends</FieldLabel>
              <Input
                id="offer-ends"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
              />
            </Field>
          </div>

          <Field orientation="horizontal">
            <Switch
              id="offer-default"
              checked={form.isDefault}
              onCheckedChange={(checked) => set('isDefault', checked)}
            />
            <FieldLabel htmlFor="offer-default">
              Preselect this offer
              <FieldDescription>
                The one the order form starts on. Only one offer per page can
                hold it.
              </FieldDescription>
            </FieldLabel>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="offer-active"
              checked={form.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
            />
            <FieldLabel htmlFor="offer-active">
              Live
              <FieldDescription>
                Turn this off to take the offer down without deleting it.
              </FieldDescription>
            </FieldLabel>
          </Field>
        </FieldGroup>
      </SettingsSection>

      <div className="flex items-center justify-end gap-3">
        {state?.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-muted-foreground text-sm">{state.success}</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial.id ? 'Save offer' : 'Create offer'}
        </Button>
      </div>
    </form>
  )
}

/**
 * Where the offer runs.
 *
 * Three scopes, and the page list is filtered by the chosen store rather than
 * flattened into one dropdown — a workspace with four shops and thirty campaign
 * pages is otherwise a scroll.
 */
function ScopePicker({
  scope,
  storeId,
  pageId,
  stores,
  onChange,
}: {
  scope: OfferFormInitial['scope']
  storeId: string
  pageId: string
  stores: OfferFormStore[]
  onChange: (next: Partial<OfferFormInitial>) => void
}) {
  const store = stores.find((candidate) => candidate.id === storeId)

  return (
    <>
      <Field>
        <FieldLabel htmlFor="offer-scope">Runs on</FieldLabel>
        <FormSelect
          id="offer-scope"
          value={scope}
          onChange={(event) => {
            const next = event.target.value as OfferFormInitial['scope']
            // Clearing the narrower ids on the way out keeps a stale page id
            // from being sent with a workspace offer and rejected by the
            // server for naming a page it does not need.
            onChange({
              scope: next,
              storeId: next === 'ORGANIZATION' ? '' : storeId,
              pageId: next === 'PAGE' ? pageId : '',
            })
          }}
        >
          <option value="PAGE">One landing page</option>
          <option value="STORE">Every page of one store</option>
          <option value="ORGANIZATION">Every store in this workspace</option>
        </FormSelect>
        <FieldDescription>
          A page shows its own offers alongside the ones its store and workspace
          run everywhere.
        </FieldDescription>
      </Field>

      {scope !== 'ORGANIZATION' && (
        <Field>
          <FieldLabel htmlFor="offer-store">Store</FieldLabel>
          <FormSelect
            id="offer-store"
            value={storeId}
            onChange={(event) =>
              onChange({ storeId: event.target.value, pageId: '' })
            }
          >
            <option value="">Choose a store…</option>
            {stores.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </FormSelect>
        </Field>
      )}

      {scope === 'PAGE' && (
        <Field>
          <FieldLabel htmlFor="offer-page">Page</FieldLabel>
          <FormSelect
            id="offer-page"
            value={pageId}
            disabled={!store}
            onChange={(event) => onChange({ pageId: event.target.value })}
          >
            <option value="">
              {store ? 'Choose a page…' : 'Choose a store first'}
            </option>
            {store?.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </FormSelect>
        </Field>
      )}
    </>
  )
}

/**
 * The products in the offer, each with an optional shortlist of sizes.
 *
 * "All sizes" is the default and stays one click away, because narrowing is the
 * exception. When a merchant does narrow it, the sizes are chips rather than a
 * multi-select: the question is "which of these four", and four checkboxes
 * answer it faster than a control that has to be opened first.
 */
function ItemEditor({
  items,
  products,
  productsCursor,
  productsTotal,
  onFound,
  currencyCode,
  showQuantity,
  onChange,
}: {
  items: OfferFormItem[]
  products: PickerProduct[]
  productsCursor: string | null
  productsTotal: number | null
  /** Hands back a product found past the picker's first page, so it resolves. */
  onFound: (product: PickerProduct) => void
  currencyCode: string
  showQuantity: boolean
  onChange: (items: OfferFormItem[]) => void
}) {
  const byId = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )

  const update = (index: number, patch: Partial<OfferFormItem>) =>
    onChange(
      items.map((item, position) =>
        position === index ? { ...item, ...patch } : item
      )
    )

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          An offer with no products cannot be sold, and will not appear on any
          page.
        </p>
      )}

      {items.map((item, index) => {
        const product = byId.get(item.productId)
        const sizes = product?.variants ?? []
        const narrowed = item.variantIds.length > 0
        const pinned = Boolean(item.variantId)

        return (
          <div key={index} className="rounded-xl border p-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted size-10 shrink-0 overflow-hidden rounded-lg">
                {product?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-muted-foreground flex size-full items-center justify-center">
                    <Package className="size-4" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {product?.title ?? 'Unknown product'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {sizes.length === 1
                    ? formatMoneyAmount(sizes[0].priceCents, currencyCode)
                    : `${sizes.length} sizes`}
                  {product?.tracksInventory &&
                    product.available <= 0 &&
                    ' · out of stock'}
                </p>
              </div>

              {showQuantity && (
                <Input
                  inputMode="numeric"
                  aria-label="Quantity"
                  value={String(item.quantity)}
                  onChange={(event) =>
                    update(index, {
                      quantity: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                  className="h-9 w-16 text-center"
                />
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove product"
                onClick={() =>
                  onChange(items.filter((_, position) => position !== index))
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>

            {sizes.length > 1 && (
              <div className="mt-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      update(index, { variantId: null, variantIds: [] })
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      !narrowed && !pinned
                        ? 'border-foreground bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    All sizes
                  </button>

                  {sizes.map((size) => {
                    const active = pinned
                      ? item.variantId === size.id
                      : item.variantIds.includes(size.id)

                    return (
                      <button
                        key={size.id}
                        type="button"
                        onClick={() => {
                          // Toggling a size builds a shortlist. A pin is a
                          // different, stronger statement made by the control
                          // below it, so touching a chip clears one.
                          const next = active
                            ? item.variantIds.filter((id) => id !== size.id)
                            : [...item.variantIds.filter(Boolean), size.id]
                          update(index, { variantId: null, variantIds: next })
                        }}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {size.title}
                        <span className="ml-1.5 opacity-60">
                          {formatMoneyAmount(size.priceCents, currencyCode)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <label className="text-muted-foreground mt-2.5 flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={pinned}
                    onCheckedChange={(checked) =>
                      update(index, {
                        variantId: checked
                          ? (item.variantIds[0] ?? sizes[0].id)
                          : null,
                        variantIds: [],
                      })
                    }
                  />
                  Lock to one size — the buyer gets no choice
                </label>

                {pinned && (
                  <FormSelect
                    aria-label="Locked size"
                    value={item.variantId ?? ''}
                    onChange={(event) =>
                      update(index, { variantId: event.target.value })
                    }
                    className="mt-2 h-9"
                  >
                    {sizes.map((size) => (
                      <option key={size.id} value={size.id}>
                        {size.title} ·{' '}
                        {formatMoneyAmount(size.priceCents, currencyCode)}
                      </option>
                    ))}
                  </FormSelect>
                )}
              </div>
            )}
          </div>
        )
      })}

      <ProductPickerDialog
        initialProducts={products}
        initialCursor={productsCursor}
        total={productsTotal}
        currencyCode={currencyCode}
        title="Add a product to this offer"
        onPick={(productId, _variantId, product) => {
          onFound(product)
          onChange([
            ...items,
            { productId, variantId: null, variantIds: [], quantity: 1 },
          ])
        }}
        trigger={
          <Button type="button" variant="outline">
            <Plus />
            Add a product
          </Button>
        }
      />
    </div>
  )
}

/**
 * The quantity → price ladder.
 *
 * The mode above it is the difference between "3 for 1000, and four is not a
 * thing we sell" and "3 for 1000, and a fourth is at list". Merchants say the
 * second out loud and used to get the first, so a buyer taking four items was
 * shown "no price is set for that many items" and left.
 */
function TierEditor({
  tiers,
  tierMode,
  currencyCode,
  onTiers,
  onMode,
}: {
  tiers: OfferFormTier[]
  tierMode: 'EXACT' | 'THRESHOLD'
  currencyCode: string
  onTiers: (tiers: OfferFormTier[]) => void
  onMode: (mode: 'EXACT' | 'THRESHOLD') => void
}) {
  const update = (index: number, patch: Partial<OfferFormTier>) =>
    onTiers(
      tiers.map((tier, position) =>
        position === index ? { ...tier, ...patch } : tier
      )
    )

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="tier-mode">Quantities between rungs</FieldLabel>
        <FormSelect
          id="tier-mode"
          value={tierMode}
          onChange={(event) =>
            onMode(event.target.value as 'EXACT' | 'THRESHOLD')
          }
        >
          <option value="THRESHOLD">
            Keep the last rung, charge the rest at list
          </option>
          <option value="EXACT">Only these exact quantities can be sold</option>
        </FormSelect>
        <FieldDescription>
          {tierMode === 'THRESHOLD'
            ? 'A buyer taking four with rungs at 2 and 3 pays the 3-item price plus one at its normal price.'
            : 'A buyer taking four with rungs at 2 and 3 is told that quantity is not available.'}
        </FieldDescription>
      </Field>

      <div className="flex flex-col gap-2">
        {tiers.map((tier, index) => (
          // Wraps rather than squeezing. Five controls in one non-wrapping row
          // left only the fixed-width rung type at its size on a phone: the
          // quantity box shrank to about 30px — 2px of typing area once its own
          // padding is taken — and the price box to less than its currency
          // prefix. A merchant on a 360px screen could not enter the item count
          // of a rung at all, which is the whole point of the control.
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Input
              inputMode="numeric"
              aria-label="Quantity"
              value={tier.quantity}
              onChange={(event) =>
                update(index, { quantity: event.target.value })
              }
              placeholder="3"
              className="w-20 shrink-0 text-center"
            />
            <span className="text-muted-foreground shrink-0 text-sm">
              items
            </span>

            <FormSelect
              aria-label="Rung type"
              value={tier.reward}
              onChange={(event) =>
                update(index, {
                  reward: event.target.value as 'PRICE' | 'PERCENT',
                })
              }
              className="w-36 shrink-0"
            >
              <option value="PRICE">cost exactly</option>
              <option value="PERCENT">get % off</option>
            </FormSelect>

            {/* Wide enough to be worth wrapping onto its own line, so what the
                rung costs is never narrower than the currency sitting in it. */}
            <div className="min-w-40 flex-1">
              {tier.reward === 'PRICE' ? (
                <MoneyInput
                  aria-label="Price"
                  currencyCode={currencyCode}
                  value={tier.price}
                  onChange={(event) =>
                    update(index, { price: event.target.value })
                  }
                  placeholder="1000"
                />
              ) : (
                <Input
                  inputMode="decimal"
                  aria-label="Percentage off"
                  value={tier.discountPercent}
                  onChange={(event) =>
                    update(index, { discountPercent: event.target.value })
                  }
                  placeholder="15"
                />
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove rung"
              onClick={() =>
                onTiers(tiers.filter((_, position) => position !== index))
              }
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() =>
            onTiers([
              ...tiers,
              {
                quantity: '',
                reward: 'PRICE',
                price: '',
                discountPercent: '',
              },
            ])
          }
        >
          <Plus />
          Add a quantity
        </Button>
      </div>
    </FieldGroup>
  )
}

/**
 * Per-size rules.
 *
 * Only the sizes actually in the offer are listed, so the panel shrinks as the
 * offer narrows and a merchant is never scrolling past sizes they already
 * excluded at the product level.
 *
 * Excluding wins over pricing: an excluded size is not sold at all, so its rate
 * would be a rule nothing can read, and the controls collapse to say so.
 */
function VariantRuleEditor({
  items,
  products,
  rules,
  currencyCode,
  offerPrices,
  onChange,
}: {
  items: OfferFormItem[]
  products: PickerProduct[]
  rules: OfferFormRule[]
  currencyCode: string
  /** False for a ladder, where the basket has one price and a rate cannot bite. */
  offerPrices: boolean
  onChange: (rules: OfferFormRule[]) => void
}) {
  const byId = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )

  const rows = useMemo(() => {
    const out: {
      variantId: string
      product: string
      size: string
      priceCents: number
    }[] = []

    for (const item of items) {
      const product = byId.get(item.productId)
      if (!product) continue
      for (const variant of product.variants) {
        if (item.variantId && variant.id !== item.variantId) continue
        if (
          !item.variantId &&
          item.variantIds.length > 0 &&
          !item.variantIds.includes(variant.id)
        ) {
          continue
        }
        out.push({
          variantId: variant.id,
          product: product.title,
          size: variant.title,
          priceCents: variant.priceCents,
        })
      }
    }
    return out
  }, [items, byId])

  const ruleFor = (variantId: string) =>
    rules.find((rule) => rule.variantId === variantId)

  const write = (variantId: string, patch: Partial<OfferFormRule>) => {
    const existing = ruleFor(variantId)
    const next: OfferFormRule = {
      variantId,
      excluded: existing?.excluded ?? false,
      pricingMode: existing?.pricingMode ?? null,
      price: existing?.price ?? '',
      discountPercent: existing?.discountPercent ?? '',
      ...patch,
    }

    // A row saying nothing is dropped rather than stored — see the matching
    // rule on the server. Keeping it would put a rule on a size that behaves
    // exactly as if there were none.
    const others = rules.filter((rule) => rule.variantId !== variantId)
    if (!next.excluded && !next.pricingMode) {
      onChange(others)
      return
    }
    onChange([...others, next])
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        Add a product above and its sizes appear here.
      </p>
    )
  }

  return (
    <div className="divide-y rounded-xl border">
      {rows.map((row) => {
        const rule = ruleFor(row.variantId)
        const excluded = rule?.excluded ?? false

        return (
          <div key={row.variantId} className="flex flex-col gap-2 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.product}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {row.size}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatMoneyAmount(row.priceCents, currencyCode)}
                </p>
              </div>

              {excluded && <Badge variant="secondary">Not in this offer</Badge>}
              {!excluded && rule?.pricingMode && (
                <Badge variant="lime">Own rate</Badge>
              )}

              <label className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                <Checkbox
                  checked={excluded}
                  onCheckedChange={(checked) =>
                    write(row.variantId, {
                      excluded: Boolean(checked),
                      pricingMode: checked ? null : (rule?.pricingMode ?? null),
                    })
                  }
                />
                Exclude
              </label>
            </div>

            {!excluded && offerPrices && (
              <div className="flex items-center gap-2">
                <FormSelect
                  aria-label={`Rate for ${row.product} ${row.size}`}
                  value={rule?.pricingMode ?? ''}
                  onChange={(event) =>
                    write(row.variantId, {
                      pricingMode:
                        (event.target.value as OfferFormRule['pricingMode']) ||
                        null,
                    })
                  }
                  className="h-9 flex-1"
                >
                  <option value="">Follows the offer</option>
                  <option value="AUTO">No discount on this size</option>
                  <option value="PERCENT">Its own percentage off</option>
                  <option value="AMOUNT">Its own amount off</option>
                </FormSelect>

                {rule?.pricingMode === 'PERCENT' && (
                  <Input
                    inputMode="decimal"
                    aria-label="Percentage off"
                    value={rule.discountPercent}
                    onChange={(event) =>
                      write(row.variantId, {
                        discountPercent: event.target.value,
                      })
                    }
                    placeholder="10"
                    className="h-9 w-28"
                  />
                )}

                {rule?.pricingMode === 'AMOUNT' && (
                  <MoneyInput
                    aria-label="Amount off"
                    currencyCode={currencyCode}
                    value={rule.price}
                    onChange={(event) =>
                      write(row.variantId, { price: event.target.value })
                    }
                    className="h-9 w-40"
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      <p className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
        <Gift className="size-3.5 shrink-0" />
        {offerPrices
          ? 'Sizes you exclude disappear from the buyer’s options rather than showing at a price the offer does not honour.'
          : 'A ladder prices the whole basket, so only exclusions apply here.'}
      </p>
    </div>
  )
}
