'use client'

import { useActionState, useEffect, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import {
  createPaymentIntentAction,
  placeOrderAction,
  saveCheckoutDetailsAction,
  selectShippingRateAction,
  type CheckoutActionState,
} from '@/app/(public-site)/sites/[subdomain]/checkout-actions'

/**
 * Storefront checkout.
 *
 * Rendered with the tenant's own theme variables rather than the dashboard's
 * component library — this page belongs to the merchant's brand, not to NCOM.
 *
 * Card details are collected by Stripe's PaymentElement, which runs inside an
 * iframe served from js.stripe.com. Raw card numbers therefore never touch
 * this origin, this server, or this database, which is what keeps the
 * platform out of PCI scope. Do not "simplify" this into our own card inputs.
 */

export interface CheckoutPaymentMethod {
  provider: 'STRIPE' | 'MANUAL' | 'CASH_ON_DELIVERY'
  displayName: string
  instructions: string | null
}

export interface CheckoutShippingRate {
  id: string
  name: string
  priceCents: number
}

const inputClass =
  'w-full rounded-[var(--page-radius)] border px-3 py-2 text-sm bg-transparent'

export function CheckoutDetailsForm({
  subdomain,
  defaults,
}: {
  subdomain: string
  defaults: {
    email: string
    firstName: string
    lastName: string
    address1: string
    address2: string
    city: string
    provinceCode: string
    countryCode: string
    postalCode: string
    phone: string
  }
}) {
  const bound = saveCheckoutDetailsAction.bind(null, subdomain)
  const [state, action, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(bound, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Contact and delivery</h2>

      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        defaultValue={defaults.email}
        className={inputClass}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="firstName"
          placeholder="First name"
          defaultValue={defaults.firstName}
          className={inputClass}
        />
        <input
          name="lastName"
          placeholder="Last name"
          defaultValue={defaults.lastName}
          className={inputClass}
        />
      </div>

      <input
        name="address1"
        required
        placeholder="Address"
        defaultValue={defaults.address1}
        className={inputClass}
      />
      <input
        name="address2"
        placeholder="Apartment, suite (optional)"
        defaultValue={defaults.address2}
        className={inputClass}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="city"
          required
          placeholder="City"
          defaultValue={defaults.city}
          className={inputClass}
        />
        <input
          name="provinceCode"
          placeholder="State / region"
          defaultValue={defaults.provinceCode}
          className={inputClass}
        />
        <input
          name="postalCode"
          placeholder="Postcode"
          defaultValue={defaults.postalCode}
          className={inputClass}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="countryCode"
          required
          maxLength={2}
          placeholder="Country code (e.g. GB)"
          defaultValue={defaults.countryCode}
          className={`${inputClass} uppercase`}
        />
        <input
          name="phone"
          placeholder="Phone (optional)"
          defaultValue={defaults.phone}
          className={inputClass}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="acceptsMarketing" className="size-4" />
        Email me with news and offers
      </label>

      {state?.error && (
        <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--page-radius)] px-6 py-3 font-medium disabled:opacity-50"
        style={{
          backgroundColor: 'var(--page-primary)',
          color: 'var(--page-background)',
        }}
      >
        {pending ? 'Saving…' : 'Continue'}
      </button>
    </form>
  )
}

export function ShippingRatePicker({
  subdomain,
  rates,
  selectedId,
  formatPrice,
}: {
  subdomain: string
  rates: CheckoutShippingRate[]
  selectedId: string | null
  formatPrice: (cents: number) => string
}) {
  const bound = selectShippingRateAction.bind(null, subdomain)
  const [state, action, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(bound, undefined)

  if (rates.length === 0) {
    return (
      <p className="text-sm" style={{ color: '#dc2626' }}>
        We do not currently deliver to that address.
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Delivery</h2>

      {rates.map((rate) => (
        <label
          key={rate.id}
          className="flex items-center justify-between gap-3 rounded-[var(--page-radius)] border px-3 py-3"
        >
          <span className="flex items-center gap-3">
            <input
              type="radio"
              name="shippingRateId"
              value={rate.id}
              defaultChecked={selectedId === rate.id}
              className="size-4"
            />
            {rate.name}
          </span>
          <span>{formatPrice(rate.priceCents)}</span>
        </label>
      ))}

      {state?.error && (
        <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start text-sm underline disabled:opacity-50"
      >
        {pending ? 'Updating…' : 'Use this option'}
      </button>
    </form>
  )
}

export function PaymentSection({
  subdomain,
  methods,
  totalCents,
  formatPrice,
}: {
  subdomain: string
  methods: CheckoutPaymentMethod[]
  totalCents: number
  formatPrice: (cents: number) => string
}) {
  const [selected, setSelected] = useState(methods[0]?.provider ?? null)

  if (methods.length === 0) {
    return (
      <p className="text-sm" style={{ color: '#dc2626' }}>
        This store has no payment methods enabled yet.
      </p>
    )
  }

  const active = methods.find((method) => method.provider === selected)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Payment</h2>

      {methods.length > 1 && (
        <div className="flex flex-col gap-2">
          {methods.map((method) => (
            <label
              key={method.provider}
              className="flex items-center gap-3 rounded-[var(--page-radius)] border px-3 py-3"
            >
              <input
                type="radio"
                name="paymentProvider"
                value={method.provider}
                checked={selected === method.provider}
                onChange={() => setSelected(method.provider)}
                className="size-4"
              />
              {method.displayName}
            </label>
          ))}
        </div>
      )}

      {active?.provider === 'STRIPE' ? (
        <StripePayment
          subdomain={subdomain}
          totalCents={totalCents}
          formatPrice={formatPrice}
        />
      ) : active ? (
        <OfflinePayment
          subdomain={subdomain}
          method={active}
          totalCents={totalCents}
          formatPrice={formatPrice}
        />
      ) : null}
    </section>
  )
}

/**
 * Cash on delivery and bank transfer.
 *
 * These place the order with no payment reference, so it is recorded as
 * PENDING and the merchant marks it paid once the money arrives.
 */
function OfflinePayment({
  subdomain,
  method,
  totalCents,
  formatPrice,
}: {
  subdomain: string
  method: CheckoutPaymentMethod
  totalCents: number
  formatPrice: (cents: number) => string
}) {
  const bound = placeOrderAction.bind(null, subdomain)
  const [state, action, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(bound, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="paymentProvider" value={method.provider} />

      {method.instructions && (
        <p className="rounded-[var(--page-radius)] border p-3 text-sm whitespace-pre-wrap">
          {method.instructions}
        </p>
      )}

      {state?.error && (
        <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--page-radius)] px-6 py-3 font-medium disabled:opacity-50"
        style={{
          backgroundColor: 'var(--page-primary)',
          color: 'var(--page-background)',
        }}
      >
        {pending
          ? 'Placing order…'
          : `Place order · ${formatPrice(totalCents)}`}
      </button>
    </form>
  )
}

function StripePayment({
  subdomain,
  totalCents,
  formatPrice,
}: {
  subdomain: string
  totalCents: number
  formatPrice: (cents: number) => string
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    createPaymentIntentAction(subdomain).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setClientSecret(result.clientSecret)
      // loadStripe is keyed by publishable key, which is per-store, so the
      // promise is created here rather than at module scope.
      setStripePromise(loadStripe(result.publishableKey))
    })

    return () => {
      cancelled = true
    }
  }, [subdomain])

  if (error) {
    return (
      <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
        {error}
      </p>
    )
  }

  if (!clientSecret || !stripePromise) {
    return <p className="text-sm opacity-70">Loading payment form…</p>
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripeCardForm
        subdomain={subdomain}
        totalCents={totalCents}
        formatPrice={formatPrice}
      />
    </Elements>
  )
}

function StripeCardForm({
  subdomain,
  totalCents,
  formatPrice,
}: {
  subdomain: string
  totalCents: number
  formatPrice: (cents: number) => string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)

  const bound = placeOrderAction.bind(null, subdomain)
  const [state, action] = useActionState<CheckoutActionState, FormData>(
    bound,
    undefined
  )

  async function confirm() {
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    // `redirect: 'if_required'` keeps card payments on this page while still
    // handling methods that must redirect (3-D Secure, wallets).
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message ?? 'Payment failed')
      setSubmitting(false)
      return
    }

    if (result.paymentIntent?.status === 'succeeded') {
      // The reference is submitted to the server, which re-checks the amount
      // and currency with Stripe before the order is marked paid. This value
      // is a claim, not proof.
      setReference(result.paymentIntent.id)
      return
    }

    setError('Payment did not complete')
    setSubmitting(false)
  }

  // Once Stripe confirms, submit the form so the order is created server-side.
  useEffect(() => {
    if (reference) {
      const form = document.getElementById(
        'stripe-order-form'
      ) as HTMLFormElement | null
      form?.requestSubmit()
    }
  }, [reference])

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />

      <form id="stripe-order-form" action={action} className="hidden">
        <input type="hidden" name="paymentProvider" value="STRIPE" />
        <input type="hidden" name="paymentReference" value={reference ?? ''} />
      </form>

      {(error || state?.error) && (
        <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
          {error ?? state?.error}
        </p>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={!stripe || submitting}
        className="rounded-[var(--page-radius)] px-6 py-3 font-medium disabled:opacity-50"
        style={{
          backgroundColor: 'var(--page-primary)',
          color: 'var(--page-background)',
        }}
      >
        {submitting ? 'Processing…' : `Pay ${formatPrice(totalCents)}`}
      </button>
    </div>
  )
}
