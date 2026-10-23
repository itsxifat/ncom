'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Lock, Tag, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  applyDiscountAction,
  checkoutQuoteAction,
  removeDiscountAction,
  type CheckoutQuote,
} from './cart-actions'
import { placeStoreOrderAction, type CheckoutInput } from './checkout-actions'
import { CHECKOUT_COUNTRIES } from './checkout-shared'
import type { CartView } from './cart-types'
import { useCart } from './CartProvider'
import { builtInName, discountRejectionText } from './i18n'
import { useStoreText } from './StoreTextProvider'
import {
  fieldLabel,
  hairline,
  headingFont,
  muted,
  panel,
  primaryButton,
  textField,
} from './ui'

export interface CheckoutMethod {
  provider: 'CASH_ON_DELIVERY' | 'MANUAL'
  displayName: string
  instructions: string | null
}

/**
 * The checkout, on one page.
 *
 * One page because every extra step on a phone is a place to give up, and the
 * questions are few: who you are, where it goes, how it gets there, how you
 * will pay. The order summary is beside the form on a computer and above the
 * button on a phone, so the total is always in view when the shopper presses
 * it — and the total is the server's, re-asked whenever the delivery rate or a
 * code changes, never a sum done in the browser.
 */
export function CheckoutView({
  initialCart,
  rates,
  methods,
  countryCode: defaultCountry,
  showCountry,
  prefill,
  continueHref,
}: {
  initialCart: CartView
  rates: { id: string; name: string; priceCents: number }[]
  methods: CheckoutMethod[]
  countryCode: string
  showCountry: boolean
  prefill: {
    name: string
    phone: string
    email: string
    address: string
    city: string
  }
  continueHref: string
}) {
  const cart = useCart()
  const { words, price, number } = useStoreText()
  const [view, setView] = useState(initialCart)
  const [form, setForm] = useState({
    ...prefill,
    note: '',
    countryCode: defaultCountry,
  })
  const [rateId, setRateId] = useState<string | null>(rates[0]?.id ?? null)
  const [method, setMethod] = useState<CheckoutMethod['provider'] | null>(
    methods[0]?.provider ?? null
  )
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [error, setError] = useState<{
    message: string
    field?: string
  } | null>(null)
  const [placing, setPlacing] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    checkoutQuoteAction({
      shippingRateId: rateId,
      countryCode: form.countryCode,
    }).then((next) => {
      if (!cancelled) setQuote(next)
    })
    return () => {
      cancelled = true
    }
  }, [rateId, form.countryCode, view.discountCode])

  const currency = view.currencyCode
  const set =
    (key: keyof typeof form) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  function applyCode() {
    setCodeError(null)
    startTransition(async () => {
      const result = await applyDiscountAction(code)
      if (result.ok) {
        setView(result.cart)
        cart?.replace(result.cart)
        setCode('')
      } else setCodeError(result.error)
    })
  }

  function removeCode() {
    startTransition(async () => {
      const result = await removeDiscountAction()
      if (result.ok) {
        setView(result.cart)
        cart?.replace(result.cart)
      }
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!method) return
    setPlacing(true)
    setError(null)
    const input: CheckoutInput = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      city: form.city,
      countryCode: form.countryCode,
      note: form.note,
      shippingRateId: rateId ?? undefined,
      paymentProvider: method,
    }
    const result = await placeStoreOrderAction(input)
    if (result.ok) {
      window.location.href = result.redirect
      return
    }
    setPlacing(false)
    setError({ message: result.error, field: result.field })
    if (result.field) {
      document.getElementById(`checkout-${result.field}`)?.focus()
    }
  }

  const blocked = view.lines.some((line) => line.unavailable)
  const invalid = (field: string) => error?.field === field

  return (
    <form
      onSubmit={submit}
      className="mx-auto grid w-full max-w-[var(--page-container-width)] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14 lg:py-12"
    >
      <div className="flex flex-col gap-8">
        <h1
          className={cn(
            'text-2xl font-semibold tracking-tight sm:text-3xl',
            headingFont
          )}
        >
          {words.checkout}
        </h1>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">
            {words.yourDetails}
          </legend>
          <Field id="name" label={words.fullName} invalid={invalid('name')}>
            <input
              id="checkout-name"
              autoComplete="name"
              required
              value={form.name}
              onChange={set('name')}
              className={textField}
            />
          </Field>
          <Field
            id="phone"
            label={words.mobileNumber}
            hint={words.mobileNumberHint}
            invalid={invalid('phone')}
          >
            <input
              id="checkout-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={set('phone')}
              placeholder="01XXXXXXXXX"
              className={textField}
            />
          </Field>
          <Field
            id="email"
            label={words.emailOptional}
            invalid={invalid('email')}
          >
            <input
              id="checkout-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              className={textField}
            />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">
            {words.deliveryAddress}
          </legend>
          <Field
            id="address"
            label={words.fullAddress}
            hint={words.fullAddressHint}
            invalid={invalid('address')}
          >
            <textarea
              id="checkout-address"
              autoComplete="street-address"
              required
              rows={2}
              value={form.address}
              onChange={set('address')}
              className={cn(textField, 'h-auto py-2.5')}
            />
          </Field>
          <div className={cn('grid gap-4', showCountry && 'sm:grid-cols-2')}>
            <Field
              id="city"
              label={words.cityDistrict}
              invalid={invalid('city')}
            >
              <input
                id="checkout-city"
                autoComplete="address-level2"
                required
                value={form.city}
                onChange={set('city')}
                placeholder={words.cityPlaceholder}
                className={textField}
              />
            </Field>
            {showCountry && (
              <Field id="countryCode" label={words.country}>
                <select
                  id="checkout-countryCode"
                  value={form.countryCode}
                  onChange={set('countryCode')}
                  className={textField}
                >
                  {CHECKOUT_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field id="note" label={words.noteForShop}>
            <textarea
              id="checkout-note"
              rows={2}
              value={form.note}
              onChange={set('note')}
              placeholder={words.notePlaceholder}
              className={cn(textField, 'h-auto py-2.5')}
            />
          </Field>
        </fieldset>

        {rates.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-lg font-semibold">
              {words.delivery}
            </legend>
            {rates.map((rate) => (
              <Choice
                key={rate.id}
                name="rate"
                checked={rateId === rate.id}
                onChange={() => setRateId(rate.id)}
                label={builtInName(rate.name, words)}
                trailing={
                  rate.priceCents === 0
                    ? words.free
                    : price(rate.priceCents, currency)
                }
                icon={<Truck className="size-4.5" />}
              />
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-lg font-semibold">
            {words.payment}
          </legend>
          {methods.length === 0 ? (
            <p className={cn('text-sm', muted)}>{words.noPaymentMethods}</p>
          ) : (
            methods.map((entry) => (
              <Choice
                key={entry.provider}
                name="payment"
                checked={method === entry.provider}
                onChange={() => setMethod(entry.provider)}
                label={builtInName(entry.displayName, words)}
                description={
                  method === entry.provider ? entry.instructions : null
                }
              />
            ))
          )}
        </fieldset>
      </div>

      {/* Summary */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className={cn(panel, 'flex flex-col gap-4 p-5')}>
          <h2 className="text-base font-semibold">{words.orderSummary}</h2>
          <ul className="flex flex-col gap-3">
            {view.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]">
                  {line.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- merchant CDN
                    <img
                      src={line.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                  <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--page-text)] text-[11px] font-bold text-[var(--page-background)]">
                    {number(line.quantity)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.title}</p>
                  {line.variantTitle && (
                    <p className={cn('truncate text-xs', muted)}>
                      {line.variantTitle}
                    </p>
                  )}
                  {line.unavailable && (
                    <p className="text-xs font-medium text-red-600">
                      {words.noLongerAvailable}
                    </p>
                  )}
                </div>
                <span className="text-sm font-medium">
                  {price(line.lineTotalCents, currency)}
                </span>
              </li>
            ))}
          </ul>

          <div className={cn('flex flex-col gap-2 border-t pt-4', hairline)}>
            {view.discountCode ? (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Tag className="size-3.5" /> {view.discountCode}
                </span>
                <button
                  type="button"
                  onClick={removeCode}
                  className={cn('text-xs underline', muted)}
                >
                  {words.remove}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={words.discountCode}
                  aria-label={words.discountCode}
                  className={cn(textField, 'h-10 text-sm')}
                />
                <button
                  type="button"
                  onClick={applyCode}
                  disabled={!code.trim()}
                  className="h-10 shrink-0 rounded-[min(var(--page-radius),0.75rem)] border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] px-4 text-sm font-semibold disabled:opacity-40"
                >
                  {words.apply}
                </button>
              </div>
            )}
            {(codeError || view.discountRejection) && (
              <p className="text-xs text-red-600">
                {codeError ??
                  discountRejectionText(words, view.discountRejection)}
              </p>
            )}
          </div>

          <dl
            className={cn(
              'flex flex-col gap-2 border-t pt-4 text-sm',
              hairline
            )}
          >
            <Row
              label={words.subtotal}
              value={price(
                quote?.subtotalCents ?? view.subtotalCents,
                currency
              )}
            />
            {(quote?.discountCents ?? view.discountCents) > 0 && (
              <Row
                label={words.discount}
                value={`−${price(quote?.discountCents ?? view.discountCents, currency)}`}
              />
            )}
            <Row
              label={words.delivery}
              value={
                quote
                  ? quote.shippingCents === 0
                    ? words.free
                    : price(quote.shippingCents, currency)
                  : '…'
              }
            />
            {quote && quote.taxCents > 0 && (
              <Row label={words.tax} value={price(quote.taxCents, currency)} />
            )}
            <div
              className={cn(
                'mt-1 flex items-baseline justify-between border-t pt-3',
                hairline
              )}
            >
              <dt className="text-base font-semibold">{words.total}</dt>
              <dd className="text-xl font-semibold">
                {quote ? price(quote.totalCents, currency) : '…'}
              </dd>
            </div>
          </dl>
        </div>

        {quote?.shippingUnavailable && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
            {words.noDeliveryToCountry}
          </p>
        )}
        {error && !error.field && (
          <p
            role="alert"
            className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700"
          >
            {error.message}
          </p>
        )}
        {error?.field && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={placing || blocked || !method || quote?.shippingUnavailable}
          className={cn(primaryButton, 'min-h-13 w-full text-base')}
        >
          {placing ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Lock className="size-4" />
          )}
          {placing
            ? words.placingOrder
            : quote
              ? words.placeOrderFor(price(quote.totalCents, currency))
              : words.placeOrder}
        </button>
        <a
          href={continueHref}
          className={cn(
            'text-center text-sm underline-offset-4 hover:underline',
            muted
          )}
        >
          {words.backToCart}
        </a>
      </aside>
    </form>
  )
}

function Field({
  id,
  label,
  hint,
  invalid,
  children,
}: {
  id: string
  label: string
  hint?: string
  invalid?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5',
        invalid && '[&_input]:border-red-500 [&_textarea]:border-red-500'
      )}
    >
      <label htmlFor={`checkout-${id}`} className={fieldLabel}>
        {label}
      </label>
      {children}
      {hint && <p className={cn('text-xs', muted)}>{hint}</p>}
    </div>
  )
}

function Choice({
  name,
  checked,
  onChange,
  label,
  description,
  trailing,
  icon,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
  description?: string | null
  trailing?: string
  icon?: React.ReactNode
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-[min(var(--page-radius),0.9rem)] border p-4 transition',
        checked
          ? 'border-[var(--page-primary)] ring-2 ring-[color-mix(in_oklab,var(--page-primary)_20%,transparent)]'
          : 'border-[color-mix(in_oklab,var(--page-text)_15%,transparent)]'
      )}
    >
      <span className="flex items-center gap-3">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="size-4 accent-[var(--page-primary)]"
        />
        {icon}
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {trailing && <span className="text-sm font-semibold">{trailing}</span>}
      </span>
      {description && (
        <span className={cn('pl-7 text-sm whitespace-pre-line', muted)}>
          {description}
        </span>
      )}
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className={muted}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
