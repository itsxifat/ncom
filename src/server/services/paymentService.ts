import 'server-only'
import Stripe from 'stripe'
import { prisma } from '@/server/db/client'
import { getProviderCredentials } from './shippingService'
import type { PaymentProvider } from '@/generated/prisma/enums'

/**
 * Payment processing.
 *
 * Each store brings its own gateway credentials, so there is no single
 * platform-wide Stripe client — a client is constructed per store from that
 * store's decrypted secret key and never cached across tenants.
 *
 * The rule this file exists to enforce: an order is marked PAID only after the
 * gateway confirms, on the server, that it holds at least the amount we
 * computed, in the currency we computed it in. Everything the browser says
 * about payment is a hint to be verified, never a fact to be trusted.
 */

export interface PaymentIntentResult {
  reference: string
  /** Safe to send to the browser — it is designed to be public. */
  clientSecret: string
  publishableKey: string
}

async function stripeClientFor(organizationId: string): Promise<Stripe> {
  const credentials = await getProviderCredentials(organizationId, 'STRIPE')
  if (!credentials?.secretKey) {
    throw new Error('Stripe is not configured for this store')
  }
  return new Stripe(credentials.secretKey)
}

/**
 * Creates a PaymentIntent for a cart's current total.
 *
 * The amount comes from the pricing engine, not from the request — a client
 * that asks to pay less than the cart costs simply cannot: it does not get to
 * name a figure.
 */
export async function createStripePaymentIntent(
  organizationId: string,
  cartId: string,
  amountCents: number,
  currencyCode: string
): Promise<PaymentIntentResult> {
  const credentials = await getProviderCredentials(organizationId, 'STRIPE')
  if (!credentials?.secretKey || !credentials.publishableKey) {
    throw new Error('Stripe is not configured for this store')
  }

  const stripe = new Stripe(credentials.secretKey)

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: currencyCode.toLowerCase(),
    // Ties the gateway record back to our cart, so a webhook or a manual
    // reconciliation can find the order it belongs to.
    metadata: { organizationId, cartId },
    automatic_payment_methods: { enabled: true },
  })

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client secret')
  }

  return {
    reference: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: credentials.publishableKey,
  }
}

/**
 * Confirms a payment reference really covers the order.
 *
 * Three checks, all of which have to pass:
 *   1. The intent actually succeeded at the gateway.
 *   2. It is for at least the amount we computed.
 *   3. It is in the currency we computed it in.
 *
 * Skipping (2) is how a tampered client gets goods for a penny; skipping (3)
 * is how 1000 JPY pays for a 1000 USD order.
 */
export async function verifyStripePayment(
  organizationId: string,
  reference: string,
  expectedCents: number,
  currencyCode: string
): Promise<void> {
  const stripe = await stripeClientFor(organizationId)

  const intent = await stripe.paymentIntents.retrieve(reference)

  if (intent.status !== 'succeeded') {
    throw new Error('That payment has not completed')
  }

  const received = intent.amount_received ?? 0
  if (received < expectedCents) {
    throw new Error('The payment does not cover the order total')
  }

  if (intent.currency.toLowerCase() !== currencyCode.toLowerCase()) {
    throw new Error('The payment is in a different currency to the order')
  }

  // A single PaymentIntent must not be redeemed for two orders. The unique
  // constraint on Order.cartId already makes double-submitting one cart safe;
  // this closes the case where the same reference is replayed against a second
  // cart entirely.
  const alreadyUsed = await prisma.transaction.findFirst({
    where: { gatewayReference: reference, status: 'SUCCESS' },
    select: { id: true },
  })
  if (alreadyUsed) {
    throw new Error('That payment has already been applied to an order')
  }
}

/**
 * Verifies a payment for whichever provider was used.
 *
 * Providers with no server-side verification implemented are rejected outright
 * rather than waved through. Accepting an unverifiable reference would mean
 * anyone could mark any order paid by posting a made-up string.
 */
export async function verifyPayment(
  organizationId: string,
  provider: PaymentProvider,
  reference: string,
  expectedCents: number,
  currencyCode: string
): Promise<void> {
  switch (provider) {
    case 'STRIPE':
      await verifyStripePayment(
        organizationId,
        reference,
        expectedCents,
        currencyCode
      )
      return

    case 'MANUAL':
    case 'CASH_ON_DELIVERY':
      // These never carry a gateway reference — the order is placed unpaid and
      // the merchant records payment later.
      throw new Error('This payment method does not take payment online')

    default:
      throw new Error(
        `Online payment for ${provider} is not implemented yet — enable a different method`
      )
  }
}

/** Which payment methods the storefront should offer. */
export async function listCheckoutPaymentMethods(organizationId: string) {
  const providers = await prisma.paymentProviderConfig.findMany({
    where: { organizationId, isEnabled: true },
    select: {
      provider: true,
      displayName: true,
      instructions: true,
      position: true,
    },
    orderBy: { position: 'asc' },
  })

  // Only methods with a working flow are offered. A configured-but-unimplemented
  // gateway showing up at checkout would be a dead end for the shopper.
  return providers.filter((entry) =>
    (['STRIPE', 'MANUAL', 'CASH_ON_DELIVERY'] as const).includes(
      entry.provider as 'STRIPE' | 'MANUAL' | 'CASH_ON_DELIVERY'
    )
  )
}
