'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db/client'
import {
  setCartAddresses,
  setCartContact,
  setCartShippingRate,
} from '@/server/services/cartService'
import { placeOrder } from '@/server/services/checkoutService'
import { createStripePaymentIntent } from '@/server/services/paymentService'
import { priceCartById } from '@/server/services/pricingService'
import { addressSchema } from '@/lib/validation/address'
import { cartContactSchema, placeOrderSchema } from '@/lib/validation/cart'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { CART_TOKEN_COOKIE } from '@/lib/storefront-cookies'

/**
 * Checkout actions.
 *
 * Same trust model as the cart actions: anonymous callers, authorized only by
 * possession of the cart token, everything scoped by the resolved storeId.
 * Nothing here accepts an amount — totals are always recomputed server-side by
 * the pricing engine.
 */

export type CheckoutActionState =
  { error?: string; success?: boolean } | undefined

async function resolveStoreId(subdomain: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { subdomain },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')
  return store.id
}

async function cartToken(): Promise<string> {
  const jar = await cookies()
  const token = jar.get(CART_TOKEN_COOKIE)?.value
  if (!token) throw new Error('Your cart has expired')
  return token
}

export async function saveCheckoutDetailsAction(
  subdomain: string,
  _prev: CheckoutActionState,
  formData: FormData
): Promise<CheckoutActionState> {
  const contact = cartContactSchema.safeParse({
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    note: formData.get('note') || undefined,
    acceptsMarketing: formData.get('acceptsMarketing') === 'on',
  })
  if (!contact.success) {
    return { error: contact.error.issues[0]?.message ?? 'Check your details' }
  }

  const address = addressSchema.safeParse({
    firstName: formData.get('firstName') || undefined,
    lastName: formData.get('lastName') || undefined,
    company: formData.get('company') || undefined,
    address1: formData.get('address1'),
    address2: formData.get('address2') || undefined,
    city: formData.get('city'),
    provinceCode: formData.get('provinceCode') || undefined,
    countryCode: formData.get('countryCode'),
    postalCode: formData.get('postalCode') || undefined,
    phone: formData.get('phone') || undefined,
  })
  if (!address.success) {
    return { error: address.error.issues[0]?.message ?? 'Check your address' }
  }

  try {
    const storeId = await resolveStoreId(subdomain)
    const token = await cartToken()
    await setCartContact(storeId, token, contact.data)
    await setCartAddresses(storeId, token, address.data)
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not save details',
    }
  }

  revalidatePath('/checkout')
  return { success: true }
}

export async function selectShippingRateAction(
  subdomain: string,
  _prev: CheckoutActionState,
  formData: FormData
): Promise<CheckoutActionState> {
  const rateId = String(formData.get('shippingRateId') ?? '')
  if (!rateId) return { error: 'Choose a delivery option' }

  try {
    const storeId = await resolveStoreId(subdomain)
    await setCartShippingRate(storeId, await cartToken(), rateId)
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not set shipping',
    }
  }

  revalidatePath('/checkout')
  return { success: true }
}

/**
 * Creates a Stripe PaymentIntent for the cart's current total.
 *
 * Returns only the client secret and publishable key — both are designed to be
 * public. The amount is read from the pricing engine, so the browser never
 * gets to name a figure.
 */
export async function createPaymentIntentAction(subdomain: string): Promise<
  | {
      ok: true
      clientSecret: string
      publishableKey: string
      reference: string
    }
  | { ok: false; error: string }
> {
  try {
    const storeId = await resolveStoreId(subdomain)
    const token = await cartToken()

    const cart = await prisma.cart.findFirst({
      where: { token, storeId, completedAt: null },
      select: { id: true },
    })
    if (!cart) return { ok: false, error: 'Your cart has expired' }

    const pricing = await priceCartById(cart.id)
    if (pricing.totalCents <= 0) {
      return { ok: false, error: 'This order has nothing to pay' }
    }

    const intent = await createStripePaymentIntent(
      storeId,
      cart.id,
      pricing.totalCents,
      pricing.currencyCode
    )

    return { ok: true, ...intent }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not start payment',
    }
  }
}

export async function placeOrderAction(
  subdomain: string,
  _prev: CheckoutActionState,
  formData: FormData
): Promise<CheckoutActionState> {
  const ip = await getClientIp()
  const limit = await checkRateLimit(`checkout:${subdomain}:${ip}`, 20, 300)
  if (!limit.allowed) {
    return { error: 'Too many attempts — please wait a moment' }
  }

  let orderId: string

  try {
    const storeId = await resolveStoreId(subdomain)
    const token = await cartToken()

    const parsed = placeOrderSchema.safeParse({
      cartToken: token,
      paymentProvider: formData.get('paymentProvider'),
      paymentReference: formData.get('paymentReference') || undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid request' }
    }

    const result = await placeOrder(storeId, parsed.data)
    orderId = result.orderId
  } catch (cause) {
    return {
      error:
        cause instanceof Error ? cause.message : 'Could not place the order',
    }
  }

  // The cart cookie is cleared on the confirmation page rather than here,
  // because redirect() throws and anything after it would not run.
  redirect(`/checkout/confirmation?order=${orderId}`)
}
