'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  Gift,
  Loader2,
  Minus,
  PartyPopper,
  Plus,
  ShieldCheck,
  Tag,
  Truck,
} from 'lucide-react'
import { SectionWrapper } from '../primitives'
import type { SectionConfig } from '../types'
import type { StorefrontCommerce } from '../registry'
import type { OrderformContent } from './index'
import {
  fixedSelection,
  quantityBounds,
  quoteOffer,
} from '@/lib/offers/pricing'
import { applyPromotions, promotionHints } from '@/lib/offers/promotions'
import { formatMoney } from '@/lib/money'
import type {
  OfferLine,
  OfferSelectionItem,
  PublicOffer,
} from '@/lib/offers/types'
import { cn } from '@/lib/utils'

/**
 * The interactive half of the order form.
 *
 * Split out of the section module deliberately. A SectionDefinition is read by
 * server components, and marking the whole module `'use client'` turns every
 * export into a client-reference proxy on the server, so `definition.schema`
 * comes back undefined and the page crashes. The definition stays server-safe
 * and only this form, which needs state and fetch, is a client component.
 *
 * The totals shown here are a *preview*. They are computed with the same pure
 * modules the server prices with (lib/offers/pricing and /promotions), from the
 * offer data this page was rendered with, so they match — but the server
 * re-derives everything from the database when the order is submitted, and its
 * answer is the one that is charged. Nothing in this component's state reaches
 * the order except which offer, which variants, how many, and where to deliver.
 */

const fieldClass =
  'w-full px-4 py-3 rounded-xl border border-black/10 bg-white text-[14px] text-[color:var(--lp-text)] placeholder:text-[color:var(--lp-text)]/35 focus:outline-none focus:border-[color:var(--lp-accent)] focus:ring-2 focus:ring-[color:var(--lp-accent)]/15 transition-shadow'

const labelClass =
  'block text-[12px] font-medium text-[color:var(--lp-text)]/70 mb-1.5'

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; orderNumber: string; totalCents: number }
  | { state: 'failed'; message: string }

export function OrderFormClient({
  content,
  config,
  storeId,
  commerce,
}: {
  content: OrderformContent
  config?: SectionConfig
  storeId?: string
  commerce?: StorefrontCommerce
}) {
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
  const [values, setValues] = useState({
    name: '',
    phone: '',
    email: '',
    street: '',
    city: '',
    note: '',
  })

  const offer = offers.find((candidate) => candidate.key === offerKey) ?? null
  const isPool = offer !== null && offer.kind !== 'FIXED'

  // Changing offer invalidates every pick that belonged to the previous one.
  function chooseOffer(next: string) {
    setOfferKey(next)
    setVariantChoices({})
    setPoolPicks({})
  }

  const selections = useMemo(
    () => buildSelections(offer, variantChoices, poolPicks),
    [offer, variantChoices, poolPicks]
  )

  const quote = useMemo(() => {
    if (!offer) return null
    return quoteOffer(offer, selections, priceLookup(offer))
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

  const setField = (field: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }))

  const priced = Boolean(quote && !quote.error)
  const goodsCents = quote?.goodsCents ?? 0
  const baseShipping = rate?.priceCents ?? 0
  const shippingCents = promo?.shippingCents ?? baseShipping
  const discountCents = promo?.discountCents ?? 0
  const offerSavings = quote ? Math.max(0, quote.savingCents) : 0
  const total = Math.max(0, goodsCents - discountCents + shippingCents)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!offer || !commerce || !quote || quote.error) return

    setStatus({ state: 'sending' })

    try {
      const response = await fetch('/api/storefront/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          pageId: commerce.pageId,
          offerKey: offer.key,
          selections,
          countryCode: content.countryCode,
          shippingRateId: rateId || undefined,
          name: values.name,
          phone: values.phone,
          email: values.email || undefined,
          address: values.street,
          city: values.city,
          note: values.note || undefined,
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        setStatus({
          state: 'failed',
          message: result.error ?? 'Could not place the order.',
        })
        return
      }

      setStatus({
        state: 'sent',
        orderNumber: result.orderNumber,
        totalCents: result.totalCents ?? total,
      })
      document
        .getElementById('order')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      setStatus({
        state: 'failed',
        message: 'Could not reach the store. Please try again.',
      })
    }
  }

  if (status.state === 'sent') {
    return (
      <SectionWrapper config={config} defaultPadding={false}>
        <section id="order" className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-lg rounded-2xl border border-black/[0.07] bg-white p-10 text-center">
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'var(--lp-accent)' }}
            >
              <PartyPopper size={24} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-[color:var(--lp-text)]">
              {content.successTitle}
            </h2>
            {content.successMessage && (
              <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--lp-text)]/65">
                {content.successMessage}
              </p>
            )}
            <div className="mt-6 space-y-1.5 rounded-xl bg-black/[0.03] px-5 py-4 text-left">
              <p className="text-[12px] text-[color:var(--lp-text)]/55">
                Order number
              </p>
              <p className="font-semibold tracking-wide text-[color:var(--lp-text)]">
                {status.orderNumber}
              </p>
              <p className="pt-2 text-[12px] text-[color:var(--lp-text)]/55">
                Amount payable on delivery
              </p>
              <p className="font-semibold text-[color:var(--lp-text)]">
                {money(status.totalCents)}
              </p>
            </div>
          </div>
        </section>
      </SectionWrapper>
    )
  }

  // A page with nothing to sell cannot take an order. Saying so plainly beats
  // rendering a form whose button can only ever fail — and the merchant sees
  // this in the builder preview, which is where it needs to be noticed.
  if (!commerce || !offer || offers.length === 0) {
    return (
      <SectionWrapper config={config} defaultPadding={false}>
        <section id="order" className="px-4 py-16 sm:px-6">
          <p className="text-center text-[14px] text-[color:var(--lp-text)]/50">
            Add an offer in the Offers tab to see the order form.
          </p>
        </section>
      </SectionWrapper>
    )
  }

  const shipping = commerce.shipping
  const bounds = quantityBounds(offer)
  const sending = status.state === 'sending'

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <section id="order" className="scroll-mt-4 px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-[color:var(--lp-text)] sm:text-3xl">
              {content.title}
            </h2>
            {content.subtitle && (
              <p className="mt-2 text-[14px] text-[color:var(--lp-text)]/60">
                {content.subtitle}
              </p>
            )}
          </div>

          <form
            onSubmit={submit}
            className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"
          >
            {offers.length > 1 && (
              <div className="border-b border-black/[0.06] p-5 sm:p-6">
                <p className={labelClass}>Choose your package</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {offers.map((candidate) => (
                    <OfferCard
                      key={candidate.key}
                      offer={candidate}
                      active={candidate.key === offer.key}
                      onSelect={() => chooseOffer(candidate.key)}
                      money={money}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Item selection */}
            {isPool ? (
              <PoolPicker
                key={offer.key}
                offer={offer}
                picks={poolPicks}
                onPicks={setPoolPicks}
                money={money}
                bounds={bounds}
              />
            ) : (
              <div className="space-y-4 border-b border-black/[0.06] p-5 sm:p-6">
                {offer.items.map((line, i) => (
                  <FixedLine
                    key={`${line.productId}-${i}`}
                    line={line}
                    chosen={variantChoices[i]}
                    onChoose={(variantId) =>
                      setVariantChoices((prev) => ({ ...prev, [i]: variantId }))
                    }
                    money={money}
                  />
                ))}
              </div>
            )}

            {/* Delivery details */}
            <div className="space-y-4 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="lp-name">
                    Full name *
                  </label>
                  <input
                    id="lp-name"
                    className={fieldClass}
                    autoComplete="name"
                    required
                    value={values.name}
                    onChange={(e) => setField('name', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="lp-phone">
                    Mobile number *
                  </label>
                  <input
                    id="lp-phone"
                    className={fieldClass}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01XXXXXXXXX"
                    required
                    value={values.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                </div>
              </div>

              {content.askEmail && (
                <div>
                  <label className={labelClass} htmlFor="lp-email">
                    Email (optional)
                  </label>
                  <input
                    id="lp-email"
                    type="email"
                    className={fieldClass}
                    autoComplete="email"
                    value={values.email}
                    onChange={(e) => setField('email', e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="lp-street">
                  Full delivery address *
                </label>
                <textarea
                  id="lp-street"
                  rows={2}
                  className={cn(fieldClass, 'resize-none')}
                  autoComplete="street-address"
                  required
                  placeholder="House, road, area"
                  value={values.street}
                  onChange={(e) => setField('street', e.target.value)}
                />
              </div>

              <div
                className={
                  shipping.askZone && shipping.rates.length > 1
                    ? 'grid gap-4 sm:grid-cols-2'
                    : ''
                }
              >
                <div>
                  <label className={labelClass} htmlFor="lp-city">
                    City / District *
                  </label>
                  <input
                    id="lp-city"
                    className={fieldClass}
                    autoComplete="address-level2"
                    required
                    value={values.city}
                    onChange={(e) => setField('city', e.target.value)}
                  />
                </div>
                {shipping.askZone && shipping.rates.length > 1 && (
                  <div>
                    <p className={labelClass}>Delivery area</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {shipping.rates.map((choice) => {
                        const active = rateId === choice.id
                        return (
                          <button
                            type="button"
                            key={choice.id}
                            onClick={() => setRateId(choice.id)}
                            className="rounded-xl border px-2 py-2.5 text-[11px] leading-tight font-medium transition-colors"
                            style={{
                              borderColor: active
                                ? 'var(--lp-accent)'
                                : 'rgba(0,0,0,0.12)',
                              background: active
                                ? 'color-mix(in srgb, var(--lp-accent) 8%, white)'
                                : 'white',
                              color: active ? 'var(--lp-accent)' : 'inherit',
                            }}
                          >
                            {choice.label}
                            <span className="block text-[10px] opacity-60">
                              {money(choice.priceCents)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {content.askNote && (
                <div>
                  <label className={labelClass} htmlFor="lp-note">
                    {content.noteLabel}
                  </label>
                  <textarea
                    id="lp-note"
                    rows={2}
                    className={cn(fieldClass, 'resize-none')}
                    value={values.note}
                    onChange={(e) => setField('note', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Summary + submit */}
            <div className="space-y-2 border-t border-black/[0.06] bg-black/[0.02] px-5 py-5 sm:px-6">
              <div className="flex justify-between text-[13px] text-[color:var(--lp-text)]/70">
                <span>
                  {offer.label}
                  {isPool && (quote?.quantity ?? 0) > 0 && (
                    <span className="text-[color:var(--lp-text)]/45">
                      {' '}
                      · {quote?.quantity} pcs
                    </span>
                  )}
                </span>
                <span>{priced ? money(goodsCents) : '—'}</span>
              </div>

              {offerSavings > 0 && priced && (
                <div
                  className="flex justify-between text-[13px]"
                  style={{ color: 'var(--lp-accent)' }}
                >
                  <span>Offer saving</span>
                  <span>−{money(offerSavings)}</span>
                </div>
              )}

              {discountCents > 0 && priced && (
                <div
                  className="flex justify-between text-[13px]"
                  style={{ color: 'var(--lp-accent)' }}
                >
                  <span className="flex items-center gap-1">
                    <Tag size={12} /> {promo?.label || 'Discount'}
                  </span>
                  <span>−{money(discountCents)}</span>
                </div>
              )}

              <div className="flex justify-between text-[13px] text-[color:var(--lp-text)]/70">
                <span>Delivery</span>
                <span>
                  {promo?.freeShipping && baseShipping > 0 ? (
                    <>
                      <span className="mr-1 line-through opacity-50">
                        {money(baseShipping)}
                      </span>
                      Free
                    </>
                  ) : shippingCents === 0 ? (
                    'Free'
                  ) : (
                    money(shippingCents)
                  )}
                </span>
              </div>

              {/* Promotion nudges */}
              {priced && hints && (hints.freeShipping || hints.discount) && (
                <div className="space-y-1 pt-1">
                  {hints.freeShipping && (
                    <p
                      className="flex items-center gap-1 text-[11px]"
                      style={{ color: 'var(--lp-accent)' }}
                    >
                      <Truck size={12} />
                      {hints.freeShipping.amountMoreCents > 0
                        ? `Add ${money(hints.freeShipping.amountMoreCents)} more for FREE delivery`
                        : `Add ${hints.freeShipping.quantityMore} more item(s) for FREE delivery`}
                    </p>
                  )}
                  {hints.discount && (
                    <p
                      className="flex items-center gap-1 text-[11px]"
                      style={{ color: 'var(--lp-accent)' }}
                    >
                      <Gift size={12} />
                      {hints.discount.amountMoreCents > 0
                        ? `Add ${money(hints.discount.amountMoreCents)} more — ${hints.discount.label}`
                        : `Add ${hints.discount.quantityMore} more item(s) — ${hints.discount.label}`}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-1 flex justify-between border-t border-black/[0.07] pt-2 text-[15px] font-bold text-[color:var(--lp-text)]">
                <span>Total payable</span>
                <span>{priced ? money(total) : '—'}</span>
              </div>

              {quote?.error && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  {quote.error}
                </p>
              )}

              {status.state === 'failed' && (
                <p
                  className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600"
                  role="alert"
                >
                  {status.message}
                </p>
              )}

              <button
                type="submit"
                disabled={sending || !priced}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[15px] font-semibold tracking-wide text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:hover:scale-100"
                style={{ background: 'var(--lp-accent)' }}
              >
                {sending && <Loader2 size={16} className="animate-spin" />}
                {sending ? 'Placing your order…' : content.submitText}
              </button>

              <div className="flex items-center justify-center gap-5 pt-2 text-[11px] text-[color:var(--lp-text)]/50">
                <span className="flex items-center gap-1.5">
                  <Truck size={13} /> Cash on delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={13} /> No advance payment
                </span>
              </div>
            </div>
          </form>
        </div>
      </section>
    </SectionWrapper>
  )
}

/**
 * One package card.
 *
 * Only a FIXED offer has one price to name. A pool offer's total depends on
 * what the buyer picks, and a "from X" here would be worse than vague: it would
 * quote one item with the whole cart's discount already taken off, so a
 * 3-piece combo could advertise less than a 2-piece. The real price is right
 * below — the tier ladder, the per-item prices, and the running total.
 */
function OfferCard({
  offer,
  active,
  onSelect,
  money,
}: {
  offer: PublicOffer
  active: boolean
  onSelect: () => void
  money: (cents: number) => string
}) {
  const exactPrice = offer.kind === 'FIXED'
  const savings = Math.max(0, offer.compareAtCents - offer.headlinePriceCents)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors"
      style={{
        borderColor: active ? 'var(--lp-accent)' : 'rgba(0,0,0,0.08)',
        background: active
          ? 'color-mix(in srgb, var(--lp-accent) 6%, white)'
          : 'white',
      }}
    >
      {offer.imageUrl && (
        <div className="relative h-14 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={offer.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[color:var(--lp-text)]">
          {offer.label}
        </p>
        {offer.description && (
          <p className="truncate text-[11px] text-[color:var(--lp-text)]/55">
            {offer.description}
          </p>
        )}
        {exactPrice && (
          <p
            className="mt-0.5 text-[13px] font-bold"
            style={{ color: 'var(--lp-accent)' }}
          >
            {money(offer.headlinePriceCents)}
            {savings > 0 && (
              <span className="ml-1.5 text-[11px] font-normal text-[color:var(--lp-text)]/40 line-through">
                {money(offer.compareAtCents)}
              </span>
            )}
          </p>
        )}
      </div>
      {offer.badge && (
        <span
          className="absolute -top-2 right-3 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase"
          style={{ background: 'var(--lp-accent)' }}
        >
          {offer.badge}
        </span>
      )}
      {active && (
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--lp-accent)' }}
        >
          <Check size={12} strokeWidth={3} className="text-white" />
        </span>
      )}
    </button>
  )
}

/** One line of a FIXED offer: the product, and its options as chips. */
function FixedLine({
  line,
  chosen,
  onChoose,
  money,
}: {
  line: OfferLine
  chosen: string | undefined
  onChoose: (variantId: string) => void
  money: (cents: number) => string
}) {
  const pinned = line.pinnedVariantId
    ? line.variants.find((v) => v.id === line.pinnedVariantId)
    : null
  // Options at different prices need the price on the chip, or the buyer picks
  // Large and the total moves for no visible reason.
  const varies = new Set(line.variants.map((v) => v.priceCents)).size > 1

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black/5">
        {line.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={line.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[color:var(--lp-text)]">
          {line.title}
          {line.quantity > 1 && (
            <span className="text-[color:var(--lp-text)]/45">
              {' '}
              × {line.quantity}
            </span>
          )}
        </p>
        {pinned ? (
          <p className="mt-0.5 text-[11px] text-[color:var(--lp-text)]/50">
            {pinned.title}
          </p>
        ) : line.variants.length > 1 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {line.variants.map((variant) => {
              const active = chosen === variant.id
              return (
                <button
                  type="button"
                  key={variant.id}
                  disabled={!variant.available}
                  onClick={() => onChoose(variant.id)}
                  className="min-w-[38px] rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-35"
                  style={{
                    borderColor: active
                      ? 'var(--lp-accent)'
                      : 'rgba(0,0,0,0.12)',
                    background: active ? 'var(--lp-accent)' : 'white',
                    color: active ? '#fff' : 'inherit',
                  }}
                >
                  {variant.title}
                  {varies ? ` · ${money(variant.priceCents)}` : ''}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Pool picker for the mix-and-match offer kinds.
 *
 * The whole row is the pick target, styled like the package cards above it so a
 * picked product reads the same way a picked package does. The option chips and
 * the stepper are real controls sitting inside that target, so each swallows its
 * own click rather than toggling the row out from under the buyer. They also
 * remain the keyboard path — the row click is a pointer convenience on top.
 */
function PoolPicker({
  offer,
  picks,
  onPicks,
  money,
  bounds,
}: {
  offer: PublicOffer
  picks: Record<string, number>
  onPicks: (next: Record<string, number>) => void
  money: (cents: number) => string
  bounds: { min: number; max: number }
}) {
  const isCollection = offer.kind === 'COLLECTION'
  const totalQty = Object.values(picks).reduce((n, x) => n + x, 0)
  const atMax = bounds.max > 0 && totalQty >= bounds.max
  const activeTierQty = isCollection
    ? ([...offer.tiers].reverse().find((t) => t.quantity <= totalQty)
        ?.quantity ?? 0)
    : 0
  const rangeLabel =
    bounds.min === bounds.max && bounds.max
      ? `${bounds.max}`
      : `${bounds.min || 1}${bounds.max ? `–${bounds.max}` : '+'}`

  return (
    <div className="border-b border-black/[0.06]">
      {isCollection ? (
        <div className="px-5 pt-5 sm:px-6">
          <p className={labelClass}>
            Pick any {rangeLabel} — price drops as you add
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offer.tiers.map((t) => {
              const active = t.quantity === activeTierQty
              return (
                <span
                  key={t.quantity}
                  className="rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
                  style={{
                    borderColor: active
                      ? 'var(--lp-accent)'
                      : 'rgba(0,0,0,0.1)',
                    background: active
                      ? 'color-mix(in srgb, var(--lp-accent) 10%, white)'
                      : 'white',
                    color: active ? 'var(--lp-accent)' : 'inherit',
                  }}
                >
                  {t.quantity} pcs · {money(t.priceCents)}
                </span>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="px-5 pt-5 sm:px-6">
          <p className={labelClass}>
            Pick what you want
            {bounds.min > 1 || bounds.max ? ` (${rangeLabel} items)` : ''}
          </p>
        </div>
      )}

      <div className="space-y-3 p-5 sm:p-6">
        {offer.pool.map((line, index) => (
          <PoolRow
            key={`${line.productId}-${index}`}
            line={line}
            picks={picks}
            onPicks={onPicks}
            money={money}
            priced={offer.kind === 'ALACARTE'}
            atMax={atMax}
          />
        ))}

        <p
          className="pt-1 text-center text-[12px]"
          style={{ color: atMax ? 'var(--lp-accent)' : 'var(--lp-text)' }}
        >
          {totalQty === 0
            ? `Add ${bounds.min || 1} or more to see your price`
            : atMax
              ? `Maximum ${bounds.max} items selected`
              : `${totalQty} selected${
                  totalQty < (bounds.min || 1)
                    ? ` — add ${(bounds.min || 1) - totalQty} more`
                    : ''
                }`}
        </p>
      </div>
    </div>
  )
}

/**
 * One *product* in a pool offer, with its options behind chips.
 *
 * The product appears once — which is the thing being chosen — and the option
 * is a second, smaller decision made inside its row. Picks stay keyed by
 * variant id, so two options of the same product remain two order lines and the
 * server prices each at its own price.
 */
function PoolRow({
  line,
  picks,
  onPicks,
  money,
  priced,
  atMax,
}: {
  line: OfferLine
  picks: Record<string, number>
  onPicks: (next: Record<string, number>) => void
  money: (cents: number) => string
  priced: boolean
  atMax: boolean
}) {
  const sellable = line.variants.filter((variant) => variant.available)
  const [variantId, setVariantId] = useState(() => sellable[0]?.id ?? '')

  if (sellable.length === 0) return null

  const variant =
    sellable.find((candidate) => candidate.id === variantId) ?? sellable[0]!
  const qty = picks[variant.id] ?? 0
  const pickedAny = sellable.some((v) => (picks[v.id] ?? 0) > 0)

  const bump = (delta: number) => {
    if (delta > 0 && atMax) return
    onPicks({ ...picks, [variant.id]: Math.max(0, qty + delta) })
  }

  // Tapping the row picks it. A 28px stepper button was the only way in — for
  // the one action the whole page exists for. Tapping a picked row clears it.
  const toggle = () => {
    if (qty > 0) {
      onPicks({ ...picks, [variant.id]: 0 })
      return
    }
    if (atMax) return
    onPicks({ ...picks, [variant.id]: 1 })
  }

  return (
    <div
      onClick={toggle}
      className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors select-none"
      style={{
        borderColor: pickedAny ? 'var(--lp-accent)' : 'rgba(0,0,0,0.08)',
        background: pickedAny
          ? 'color-mix(in srgb, var(--lp-accent) 6%, white)'
          : 'white',
      }}
    >
      <div className="relative h-14 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black/5">
        {line.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={line.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[color:var(--lp-text)]">
          {line.title}
          {priced && (
            <span className="text-[color:var(--lp-text)]/55">
              {' '}
              · {money(variant.priceCents)}
            </span>
          )}
        </p>
        {sellable.length > 1 && (
          <div
            className="mt-1.5 flex flex-wrap gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {sellable.map((choice) => {
              const active = variant.id === choice.id
              const chosenQty = picks[choice.id] ?? 0
              return (
                <button
                  type="button"
                  key={choice.id}
                  onClick={() => setVariantId(choice.id)}
                  className="min-w-[34px] rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: active
                      ? 'var(--lp-accent)'
                      : 'rgba(0,0,0,0.12)',
                    background: active ? 'var(--lp-accent)' : 'white',
                    color: active ? '#fff' : 'inherit',
                  }}
                >
                  {choice.title}
                  {chosenQty > 0 ? ` ×${chosenQty}` : ''}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {/* Covers the buttons, the count and the gaps between them. */}
      <div
        className="flex flex-shrink-0 items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={!qty}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-black/15 text-[color:var(--lp-text)]/70 disabled:opacity-30"
          aria-label="Remove one"
        >
          <Minus size={13} />
        </button>
        <span className="w-6 text-center text-[13px] font-semibold text-[color:var(--lp-text)] tabular-nums">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={atMax}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white disabled:opacity-30"
          style={{ background: 'var(--lp-accent)' }}
          aria-label="Add one"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
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
