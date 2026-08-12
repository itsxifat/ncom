'use client'

import { useEffect, useMemo, useState } from 'react'
import { SectionContainer, SectionWrapper } from '../primitives'
import type { SectionConfig } from '../types'
import type { StorefrontCommerce } from '../registry'
import { SELECT_OFFER_EVENT } from '../StorefrontEnhancements'
import type { OrderFormContent } from './index'
import {
  fixedSelection,
  quantityBounds,
  quoteOffer,
} from '@/lib/offers/pricing'
import { applyPromotions, promotionHints } from '@/lib/offers/promotions'
import { formatMoney } from '@/lib/money'
import type { OfferSelectionItem, PublicOffer } from '@/lib/offers/types'
import { OfferPicker } from './OfferPicker'
import { Radio, RadioGroup } from '@/components/ui/radio'
import { FormSelect } from '@/components/ui/form-select'

/**
 * The interactive half of the order form.
 *
 * Split out of the section module deliberately. A SectionDefinition is read by
 * server components — PageRenderer resolves `schema`, `defaultContent` and
 * `editorFields` off it — and marking the whole module `'use client'` turns
 * every export into a client-reference proxy on the server, so
 * `definition.schema` comes back undefined and the page crashes. The definition
 * therefore stays server-safe and only this form, which needs state and fetch,
 * is a client component.
 *
 * The totals shown here are a *preview*. They are computed with the same pure
 * module the server prices with (lib/offers/pricing and /promotions), from the
 * offer data this page was rendered with, so they match — but the server
 * re-derives everything from the database when the order is submitted, and its
 * answer is the one that is charged. Nothing in this component's state reaches
 * the order except which offer, which variants, how many, and where to deliver.
 */

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; orderNumber: string }
  | { state: 'failed'; message: string }

export function OrderFormClient({
  content,
  config,
  storeId,
  commerce,
}: {
  content: OrderFormContent
  config?: SectionConfig
  storeId?: string
  commerce?: StorefrontCommerce
}) {
  // Memoised because the effect below depends on it; a fresh `[]` on every
  // render would re-bind the listener each pass.
  const offers = useMemo(() => commerce?.offers ?? [], [commerce])
  const currencyCode = commerce?.currencyCode ?? 'BDT'
  const money = useMemo(
    () => (cents: number) => formatMoney(cents, currencyCode),
    [currencyCode]
  )

  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const [offerKey, setOfferKey] = useState(
    () => (offers.find((offer) => offer.isDefault) ?? offers[0])?.key ?? ''
  )
  /** FIXED offers: line index → chosen variant. */
  const [variantChoices, setVariantChoices] = useState<
    Record<number, string | undefined>
  >({})
  /** Pool offers: variant id → how many. */
  const [poolPicks, setPoolPicks] = useState<Record<string, number>>({})
  const [rateId, setRateId] = useState(
    () => commerce?.shipping.rates[0]?.id ?? ''
  )

  const offer = offers.find((candidate) => candidate.key === offerKey) ?? null

  // Changing offer invalidates every pick that belonged to the previous one.
  function chooseOffer(next: string) {
    setOfferKey(next)
    setVariantChoices({})
    setPoolPicks({})
  }

  // A bundle card elsewhere on the page selects an offer here. Those cards are
  // Liquid-rendered HTML with no React connection to this component, so
  // StorefrontEnhancements relays the click as a window event.
  useEffect(() => {
    function onSelect(event: Event) {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key
      if (!key) return
      if (!offers.some((offer) => offer.key === key)) return
      chooseOffer(key)
    }

    window.addEventListener(SELECT_OFFER_EVENT, onSelect)
    return () => window.removeEventListener(SELECT_OFFER_EVENT, onSelect)
  }, [offers])

  const selections = useMemo(
    () => buildSelections(offer, variantChoices, poolPicks),
    [offer, variantChoices, poolPicks]
  )

  const quote = useMemo(() => {
    if (!offer) return null
    const unitPrice = priceLookup(offer)
    return quoteOffer(offer, selections, unitPrice)
  }, [offer, selections])

  const rate = commerce?.shipping.rates.find((r) => r.id === rateId) ?? null

  const promo = useMemo(() => {
    if (!commerce || !quote || quote.error) return null
    return applyPromotions({
      goodsCents: quote.goodsCents,
      quantity: quote.quantity,
      shippingCents: rate?.priceCents ?? 0,
      promotions: commerce.promotions,
      formatMoney: money,
    })
  }, [commerce, quote, rate, money])

  const hints = useMemo(() => {
    if (!commerce || !quote || quote.error) return null
    return promotionHints({
      goodsCents: quote.goodsCents,
      quantity: quote.quantity,
      promotions: commerce.promotions,
      formatMoney: money,
    })
  }, [commerce, quote, money])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!offer || !commerce || !quote || quote.error) return

    setStatus({ state: 'sending' })

    const formData = new FormData(event.currentTarget)
    const payload = {
      storeId,
      pageId: commerce.pageId,
      offerKey: offer.key,
      selections,
      countryCode: content.countryCode,
      shippingRateId: rateId || undefined,
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email') ?? undefined,
      address: formData.get('address'),
      city: formData.get('city'),
      note: formData.get('note') ?? undefined,
    }

    try {
      const response = await fetch('/api/storefront/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()

      if (!response.ok) {
        setStatus({
          state: 'failed',
          message: result.error ?? 'Could not place the order',
        })
        return
      }

      setStatus({ state: 'sent', orderNumber: result.orderNumber })
    } catch {
      setStatus({
        state: 'failed',
        message: 'Could not reach the store. Please try again.',
      })
    }
  }

  if (status.state === 'sent') {
    return (
      <SectionWrapper config={config}>
        <SectionContainer>
          <div className="mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <p className="text-lg font-semibold text-emerald-900">
              {content.successMessage}
            </p>
            <p className="mt-2 font-mono text-sm text-emerald-700">
              {status.orderNumber}
            </p>
          </div>
        </SectionContainer>
      </SectionWrapper>
    )
  }

  // A page with nothing to sell cannot take an order. Saying so plainly beats
  // rendering a form whose button can only ever fail — and the merchant sees
  // this in the builder preview, which is where it needs to be noticed.
  if (!commerce || offers.length === 0) {
    return (
      <SectionWrapper config={config}>
        <SectionContainer>
          <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="font-medium text-neutral-700">
              This page has no offers yet
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Add one in the Offers tab to start taking orders.
            </p>
          </div>
        </SectionContainer>
      </SectionWrapper>
    )
  }

  const shipping = commerce.shipping
  const canSubmit = Boolean(quote && !quote.error) && status.state !== 'sending'

  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        <div className="mx-auto max-w-2xl" id="order">
          <div className="text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              {content.heading}
            </h2>
            {content.subheading && (
              <p className="mt-2 text-[color:var(--page-muted,#64748b)]">
                {content.subheading}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {offers.length > 0 && (
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">
                  {content.offersLabel}
                </legend>
                <OfferPicker
                  offers={offers}
                  selectedKey={offerKey}
                  onSelect={chooseOffer}
                  style={content.offerStyle}
                  money={money}
                />
              </fieldset>
            )}

            {offer && (
              <OfferDetail
                offer={offer}
                variantChoices={variantChoices}
                onVariant={(index, variantId) =>
                  setVariantChoices((prev) => ({ ...prev, [index]: variantId }))
                }
                poolPicks={poolPicks}
                onPool={setPoolPicks}
                money={money}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={content.nameLabel} name="name" required />
              <Field
                label={content.phoneLabel}
                name="phone"
                type="tel"
                inputMode="tel"
                required
              />
              {content.showEmail && (
                <Field label="Email" name="email" type="email" />
              )}
              <Field label={content.cityLabel} name="city" required />
              <div className="sm:col-span-2">
                <Field label={content.addressLabel} name="address" required />
              </div>
              {content.showNote && (
                <div className="sm:col-span-2">
                  <Field label={content.noteLabel} name="note" />
                </div>
              )}
            </div>

            {shipping.askZone && shipping.rates.length > 1 && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  {content.zoneLabel}
                </legend>
                <RadioGroup
                  name="zone"
                  value={rateId}
                  onValueChange={(next) => setRateId(String(next))}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {shipping.rates.map((choice) => (
                    <label
                      key={choice.id}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                        rateId === choice.id
                          ? 'border-current bg-black/[0.04] font-medium'
                          : 'border-neutral-200'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Radio tone="page" value={choice.id} />
                        {choice.label}
                      </span>
                      <span className="tabular-nums">
                        {money(choice.priceCents)}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
            )}

            {hints && (hints.freeShipping || hints.discount) && (
              <div className="space-y-1.5">
                {hints.freeShipping && (
                  <Nudge>
                    {hints.freeShipping.amountMoreCents > 0
                      ? `Add ${money(hints.freeShipping.amountMoreCents)} more for free delivery`
                      : `Add ${hints.freeShipping.quantityMore} more for free delivery`}
                  </Nudge>
                )}
                {hints.discount && (
                  <Nudge>
                    {hints.discount.amountMoreCents > 0
                      ? `Add ${money(hints.discount.amountMoreCents)} more — ${hints.discount.label}`
                      : `Add ${hints.discount.quantityMore} more — ${hints.discount.label}`}
                  </Nudge>
                )}
              </div>
            )}

            {content.showSummary && quote && !quote.error && (
              <dl className="space-y-1.5 rounded-xl bg-black/[0.03] p-4 text-sm">
                <Row
                  label={content.subtotalLabel}
                  value={money(quote.regularCents)}
                />
                {quote.savingCents + (promo?.discountCents ?? 0) > 0 && (
                  <Row
                    label={
                      promo?.label
                        ? `${content.discountLabel} · ${promo.label}`
                        : content.discountLabel
                    }
                    value={`− ${money(quote.savingCents + (promo?.discountCents ?? 0))}`}
                    tone="positive"
                  />
                )}
                <Row
                  label={content.deliveryLabel}
                  value={
                    promo?.freeShipping
                      ? 'Free'
                      : money(promo?.shippingCents ?? rate?.priceCents ?? 0)
                  }
                />
                <div className="mt-2 border-t border-black/10 pt-2">
                  <Row
                    label={content.totalLabel}
                    value={money(
                      Math.max(
                        0,
                        quote.goodsCents -
                          (promo?.discountCents ?? 0) +
                          (promo?.shippingCents ?? rate?.priceCents ?? 0)
                      )
                    )}
                    strong
                  />
                </div>
              </dl>
            )}

            {quote?.error && (
              <p className="text-sm text-amber-700">{quote.error}</p>
            )}

            {status.state === 'failed' && (
              <p className="text-sm text-red-600">{status.message}</p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl px-6 py-4 text-base font-bold text-white transition disabled:opacity-50"
              style={{ background: content.buttonColor }}
            >
              {status.state === 'sending' ? '…' : content.buttonLabel}
            </button>
          </form>
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

/**
 * Turns the buyer's UI state into the selection list the server prices.
 *
 * A FIXED offer's contents are the merchant's, so this fills in each line's
 * variant; a pool offer's contents are the buyer's, so it reads their picks.
 * Returns an empty list when a FIXED offer still has an unanswered choice,
 * which is what leaves the quote in its "choose an option" state.
 */
function buildSelections(
  offer: PublicOffer | null,
  variantChoices: Record<number, string | undefined>,
  poolPicks: Record<string, number>
): OfferSelectionItem[] {
  if (!offer) return []

  if (offer.kind === 'FIXED') {
    return fixedSelection(offer, variantChoices) ?? []
  }

  const byVariant = new Map<string, string>()
  for (const line of offer.pool) {
    for (const variant of line.variants)
      byVariant.set(variant.id, line.productId)
  }

  return Object.entries(poolPicks)
    .filter(([, quantity]) => quantity > 0)
    .map(([variantId, quantity]) => ({
      productId: byVariant.get(variantId) ?? '',
      variantId,
      quantity,
    }))
}

/** Unit prices as the page was rendered with them. */
function priceLookup(offer: PublicOffer) {
  const prices = new Map<string, number>()
  for (const line of [...offer.items, ...offer.pool]) {
    for (const variant of line.variants)
      prices.set(variant.id, variant.priceCents)
  }
  return (variantId: string) => prices.get(variantId) ?? null
}

/**
 * The chosen offer's own controls: a variant picker per line for a FIXED
 * offer, or a quantity stepper per pool item for the mix-and-match kinds.
 */
function OfferDetail({
  offer,
  variantChoices,
  onVariant,
  poolPicks,
  onPool,
  money,
}: {
  offer: PublicOffer
  variantChoices: Record<number, string | undefined>
  onVariant: (index: number, variantId: string) => void
  poolPicks: Record<string, number>
  onPool: (next: Record<string, number>) => void
  money: (cents: number) => string
}) {
  const bounds = quantityBounds(offer)
  const picked = Object.values(poolPicks).reduce((sum, n) => sum + n, 0)

  if (offer.kind === 'FIXED') {
    // Lines with a pinned variant, or only one, need no control at all —
    // showing a dropdown with a single option is noise on a phone.
    const choosable = offer.items
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !line.pinnedVariantId && line.variants.length > 1)

    if (choosable.length === 0) return null

    return (
      <div className="space-y-3">
        {choosable.map(({ line, index }) => (
          <div key={`${line.productId}-${index}`}>
            <label className="mb-1.5 block text-sm font-medium">
              {line.title}
            </label>
            <FormSelect
              tone="page"
              value={variantChoices[index] ?? ''}
              onChange={(event) => onVariant(index, event.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3"
            >
              <option value="">Choose an option</option>
              {line.variants.map((variant) => (
                <option
                  key={variant.id}
                  value={variant.id}
                  disabled={!variant.available}
                >
                  {variant.title}
                  {variant.available ? '' : ' — out of stock'}
                </option>
              ))}
            </FormSelect>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[color:var(--page-muted,#64748b)]">
        {bounds.max > 0
          ? `Choose ${bounds.min === bounds.max ? bounds.min : `${bounds.min}–${bounds.max}`} items · ${picked} chosen`
          : `Choose at least ${bounds.min} · ${picked} chosen`}
      </p>
      {offer.pool.map((line) =>
        line.variants
          .filter((variant) => variant.available)
          .map((variant) => {
            const quantity = poolPicks[variant.id] ?? 0
            return (
              <div
                key={variant.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 p-2.5"
              >
                {line.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.imageUrl}
                    alt=""
                    className="h-12 w-12 flex-none rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.title}</p>
                  <p className="text-xs text-[color:var(--page-muted,#64748b)]">
                    {line.variants.length > 1 ? `${variant.title} · ` : ''}
                    {offer.kind === 'ALACARTE' ? money(variant.priceCents) : ''}
                  </p>
                </div>
                <Stepper
                  value={quantity}
                  onChange={(next) =>
                    onPool({ ...poolPicks, [variant.id]: next })
                  }
                  max={
                    bounds.max > 0
                      ? Math.max(0, bounds.max - picked + quantity)
                      : 99
                  }
                />
              </div>
            )
          })
      )}
    </div>
  )
}

function Stepper({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (next: number) => void
  max: number
}) {
  return (
    <div className="flex flex-none items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        className="h-8 w-8 rounded-lg border border-neutral-300 disabled:opacity-30"
        aria-label="Remove one"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="h-8 w-8 rounded-lg border border-neutral-300 disabled:opacity-30"
        aria-label="Add one"
      >
        +
      </button>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required,
  inputMode,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  inputMode?: 'tel' | 'text' | 'email'
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
      />
    </label>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'positive'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? 'font-semibold' : ''}>{label}</dt>
      <dd
        className={`tabular-nums ${strong ? 'text-lg font-bold' : ''} ${
          tone === 'positive' ? 'text-emerald-600' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function Nudge({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {children}
    </p>
  )
}
