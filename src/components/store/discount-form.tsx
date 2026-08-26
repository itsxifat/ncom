'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  saveDiscountAction,
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
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect, MoneyInput } from '@/components/store/form-controls'
import { Checkbox } from '@/components/ui/checkbox'

export interface DiscountFormInitial {
  id?: string
  title: string
  method: 'CODE' | 'AUTOMATIC'
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING' | 'BUY_X_GET_Y'
  percentage: string
  amount: string
  /** A ceiling on a percentage. Blank is no ceiling. */
  maxDiscount: string
  /** Which storefronts honour this. Empty means all of them. */
  storeIds: string[]
  appliesTo: 'ALL' | 'PRODUCTS' | 'COLLECTIONS' | 'VARIANTS'
  targetProductIds: string[]
  targetCollectionIds: string[]
  targetVariantIds: string[]
  excludedProductIds: string[]
  excludedVariantIds: string[]
  minimumSubtotal: string
  minimumQuantity: string
  buyQuantity: string
  getQuantity: string
  usageLimit: string
  oncePerCustomer: boolean
  combinesWithOther: boolean
  startsAt: string
  endsAt: string
  isActive: boolean
  codes: string[]
}

/**
 * A scrolling list of ticked ids.
 *
 * Collapsed behind a summary once there are more than a handful, because the
 * size list on a real catalogue is hundreds of rows and an always-open one
 * pushes every field below it off the screen.
 */
function IdChecklist({
  options,
  selected,
  empty,
  heading,
  onChange,
}: {
  options: { id: string; label: string }[]
  selected: string[]
  empty: string
  heading?: string
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options

  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }

  return (
    <div className="rounded-lg border">
      {(heading || options.length > 8) && (
        <div className="flex items-center gap-2 border-b p-2">
          {heading && (
            <span className="text-muted-foreground shrink-0 text-xs font-medium">
              {heading}
            </span>
          )}
          {options.length > 8 && (
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label={heading ? `Search ${heading}` : 'Search'}
              className="h-8 text-xs"
            />
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
            >
              Clear {selected.length}
            </button>
          )}
        </div>
      )}

      <div className="max-h-56 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            Nothing matches that search.
          </p>
        ) : (
          shown.map((option) => (
            <label
              key={option.id}
              className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm"
            >
              <Checkbox
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id)
                  )
                }
              />
              {option.label}
            </label>
          ))
        )}
      </div>
    </div>
  )
}

/** Generates a readable, unambiguous code — no O/0 or I/1 confusion. */
function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export function DiscountForm({
  currencyCode,
  initial,
  products,
  collections,
  stores = [],
  variants = [],
}: {
  currencyCode: string
  initial: DiscountFormInitial
  products: { id: string; title: string }[]
  collections: { id: string; title: string }[]
  /** Storefronts this workspace runs, for limiting the campaign to some. */
  stores?: { id: string; name: string }[]
  /** Every sellable size, for size-level targeting and exclusions. */
  variants?: { id: string; productTitle: string; title: string }[]
}) {
  const boundAction = saveDiscountAction.bind(null, initial.id ?? null)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  const [form, setForm] = useState(initial)
  const set = <K extends keyof DiscountFormInitial>(
    key: K,
    value: DiscountFormInitial[K]
  ) => setForm((current) => ({ ...current, [key]: value }))

  const payload = useMemo(() => JSON.stringify(form), [form])

  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />

      <SettingsSection
        title="Discount"
        description="What the customer gets and how they claim it."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="title">Internal title</FieldLabel>
            <Input
              id="title"
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="Summer sale 2026"
              required
            />
            <FieldDescription>
              Only you see this. Customers see the code.
            </FieldDescription>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="method">How it applies</FieldLabel>
              <FormSelect
                id="method"
                value={form.method}
                onChange={(event) =>
                  set('method', event.target.value as 'CODE' | 'AUTOMATIC')
                }
              >
                <option value="CODE">Customer enters a code</option>
                <option value="AUTOMATIC">Applied automatically</option>
              </FormSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="type">Discount type</FieldLabel>
              <FormSelect
                id="type"
                value={form.type}
                onChange={(event) =>
                  set('type', event.target.value as DiscountFormInitial['type'])
                }
              >
                <option value="PERCENTAGE">Percentage off</option>
                <option value="FIXED_AMOUNT">Fixed amount off</option>
                <option value="FREE_SHIPPING">Free shipping</option>
                <option value="BUY_X_GET_Y">Buy X get Y free</option>
              </FormSelect>
            </Field>
          </div>

          {form.type === 'PERCENTAGE' && (
            <Field>
              <FieldLabel htmlFor="percentage">Percentage off</FieldLabel>
              <Input
                id="percentage"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={form.percentage}
                onChange={(event) => set('percentage', event.target.value)}
                placeholder="10"
              />
            </Field>
          )}

          {form.type === 'PERCENTAGE' && (
            <Field>
              <FieldLabel htmlFor="maxDiscount">
                Cap the discount (optional)
              </FieldLabel>
              <MoneyInput
                id="maxDiscount"
                currencyCode={currencyCode}
                value={form.maxDiscount}
                onChange={(event) => set('maxDiscount', event.target.value)}
                placeholder="No cap"
              />
              <FieldDescription>
                &ldquo;20% off, up to 500&rdquo;. An uncapped percentage costs
                the most on the one order of the month that is ten times the
                average.
              </FieldDescription>
            </Field>
          )}

          {form.type === 'FIXED_AMOUNT' && (
            <Field>
              <FieldLabel htmlFor="amount">Amount off</FieldLabel>
              <MoneyInput
                id="amount"
                currencyCode={currencyCode}
                value={form.amount}
                onChange={(event) => set('amount', event.target.value)}
                placeholder="10.00"
              />
              <FieldDescription>
                Never discounts below zero — a larger amount is capped at the
                eligible subtotal.
              </FieldDescription>
            </Field>
          )}

          {form.type === 'BUY_X_GET_Y' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="buyQuantity">Customer buys</FieldLabel>
                <Input
                  id="buyQuantity"
                  type="number"
                  min={1}
                  value={form.buyQuantity}
                  onChange={(event) => set('buyQuantity', event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="getQuantity">
                  Customer gets free
                </FieldLabel>
                <Input
                  id="getQuantity"
                  type="number"
                  min={1}
                  value={form.getQuantity}
                  onChange={(event) => set('getQuantity', event.target.value)}
                />
                <FieldDescription>
                  The cheapest eligible items become free.
                </FieldDescription>
              </Field>
            </div>
          )}
        </FieldGroup>
      </SettingsSection>

      {form.method === 'CODE' && (
        <SettingsSection
          title="Codes"
          description="One discount can have several codes — useful for per-channel or per-influencer tracking."
        >
          <FieldGroup>
            {form.codes.map((code, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={code}
                  onChange={(event) =>
                    set(
                      'codes',
                      form.codes.map((current, i) =>
                        i === index ? event.target.value.toUpperCase() : current
                      )
                    )
                  }
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove code"
                  onClick={() =>
                    set(
                      'codes',
                      form.codes.filter((_, i) => i !== index)
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}

            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={() => set('codes', [...form.codes, randomCode()])}
              >
                <Plus />
                Add code
              </Button>
            </Field>
          </FieldGroup>
        </SettingsSection>
      )}

      <SettingsSection
        title="Applies to"
        description="Limit the discount to specific products or collections."
      >
        <FieldGroup>
          <Field>
            <FormSelect
              value={form.appliesTo}
              aria-label="Applies to"
              onChange={(event) =>
                set(
                  'appliesTo',
                  event.target.value as DiscountFormInitial['appliesTo']
                )
              }
            >
              <option value="ALL">Everything in the store</option>
              <option value="PRODUCTS">Specific products</option>
              <option value="COLLECTIONS">Specific collections</option>
              <option value="VARIANTS">Specific sizes</option>
            </FormSelect>
            <FieldDescription>
              Sizes are for catalogues where the price varies by size and the
              promotion does not cover all of them.
            </FieldDescription>
          </Field>

          {form.appliesTo === 'VARIANTS' && (
            <Field>
              <IdChecklist
                options={variants.map((variant) => ({
                  id: variant.id,
                  label: `${variant.productTitle} · ${variant.title}`,
                }))}
                selected={form.targetVariantIds}
                empty="No sizes in the catalogue yet."
                onChange={(next) => set('targetVariantIds', next)}
              />
            </Field>
          )}

          {form.appliesTo === 'PRODUCTS' && (
            <Field>
              <div className="max-h-64 overflow-y-auto rounded-lg border p-2">
                {products.map((product) => (
                  <label
                    key={product.id}
                    className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={form.targetProductIds.includes(product.id)}
                      onCheckedChange={(checked) =>
                        set(
                          'targetProductIds',
                          checked
                            ? [...form.targetProductIds, product.id]
                            : form.targetProductIds.filter(
                                (id) => id !== product.id
                              )
                        )
                      }
                    />
                    {product.title}
                  </label>
                ))}
              </div>
            </Field>
          )}

          {form.appliesTo === 'COLLECTIONS' && (
            <Field>
              <div className="max-h-64 overflow-y-auto rounded-lg border p-2">
                {collections.map((collection) => (
                  <label
                    key={collection.id}
                    className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={form.targetCollectionIds.includes(collection.id)}
                      onCheckedChange={(checked) =>
                        set(
                          'targetCollectionIds',
                          checked
                            ? [...form.targetCollectionIds, collection.id]
                            : form.targetCollectionIds.filter(
                                (id) => id !== collection.id
                              )
                        )
                      }
                    />
                    {collection.title}
                  </label>
                ))}
              </div>
            </Field>
          )}

          {/* Exclusions are checked after the scope above picks a line up, so
              "everything except these two sizes" is one rule rather than a
              checklist of every size that *is* on offer. */}
          <Field>
            <FieldLabel>Never applies to</FieldLabel>
            <FieldDescription>
              Carved out of whatever the scope above selected — the thin-margin
              size, the loss leader, the item already on clearance.
            </FieldDescription>
            <IdChecklist
              options={products.map((product) => ({
                id: product.id,
                label: product.title,
              }))}
              selected={form.excludedProductIds}
              empty="No products yet."
              heading="Products"
              onChange={(next) => set('excludedProductIds', next)}
            />
            <IdChecklist
              options={variants.map((variant) => ({
                id: variant.id,
                label: `${variant.productTitle} · ${variant.title}`,
              }))}
              selected={form.excludedVariantIds}
              empty="No sizes yet."
              heading="Sizes"
              onChange={(next) => set('excludedVariantIds', next)}
            />
          </Field>
        </FieldGroup>
      </SettingsSection>

      {stores.length > 1 && (
        <SettingsSection
          title="Which storefronts"
          description="One catalogue can be sold through several sites. Leave everything unticked to honour the code on all of them."
        >
          <FieldGroup>
            <Field>
              <IdChecklist
                options={stores.map((store) => ({
                  id: store.id,
                  label: store.name,
                }))}
                selected={form.storeIds}
                empty="No stores yet."
                onChange={(next) => set('storeIds', next)}
              />
            </Field>
          </FieldGroup>
        </SettingsSection>
      )}

      <SettingsSection
        title="Conditions and limits"
        description="Minimums the cart must meet, and how many times the discount can be used."
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="minimumSubtotal">
                Minimum subtotal
              </FieldLabel>
              <MoneyInput
                id="minimumSubtotal"
                currencyCode={currencyCode}
                value={form.minimumSubtotal}
                onChange={(event) => set('minimumSubtotal', event.target.value)}
                placeholder="No minimum"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="minimumQuantity">Minimum items</FieldLabel>
              <Input
                id="minimumQuantity"
                type="number"
                min={0}
                value={form.minimumQuantity}
                onChange={(event) => set('minimumQuantity', event.target.value)}
                placeholder="No minimum"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="usageLimit">Total uses allowed</FieldLabel>
            <Input
              id="usageLimit"
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(event) => set('usageLimit', event.target.value)}
              placeholder="Unlimited"
            />
            <FieldDescription>
              Enforced during checkout, so simultaneous orders cannot push past
              the cap.
            </FieldDescription>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.oncePerCustomer}
              onCheckedChange={(checked) => set('oncePerCustomer', checked)}
            />
            Limit to one use per customer
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="startsAt">Starts</FieldLabel>
              <Input
                id="startsAt"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="endsAt">Ends</FieldLabel>
              <Input
                id="endsAt"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
              />
              <FieldDescription>
                Leave empty to run indefinitely.
              </FieldDescription>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
            />
            Active
          </label>
        </FieldGroup>
      </SettingsSection>

      <Card>
        <CardContent>
          <FieldGroup>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : initial.id
                    ? 'Save discount'
                    : 'Create discount'}
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}
