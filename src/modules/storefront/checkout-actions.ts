'use server'

import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import {
  attachCartToCustomer,
  setCartCheckoutDetails,
  setCartShippingRate,
} from '@/server/services/cartService'
import { placeOrder } from '@/server/services/checkoutService'
import { listCheckoutPaymentMethods } from '@/server/services/paymentService'
import { queuePurchaseConversion } from '@/server/services/trackingService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { storefrontCookieOptions } from '@/lib/storefront-cookies'
import {
  clearCartToken,
  readCartToken,
  requestCustomer,
  requestStore,
} from '@/server/storefront/request'
import { latinDigits } from '@/modules/sections/language'
import { checkoutIssueMessage, LAST_ORDER_COOKIE } from './checkout-shared'
import { DEFAULT_STORE_TEXT, storeText } from './i18n'

/**
 * A store's one-page checkout.
 *
 * Same trust model as the cart: a stranger, authorised only by the cart token
 * in their cookie, at a store named by the request's hostname. The form says
 * who is buying, where it goes and how they will pay; everything that costs
 * money — the goods, the delivery rate, the discount, the total — is read
 * back from the cart and priced by the server inside `placeOrder`, which is
 * also where stock is taken and the order written in one transaction.
 *
 * A phone number is the one contact detail required. A cash-on-delivery shop
 * confirms orders by calling, and the courier calls on delivery; an email is
 * welcome but asking for one loses the shoppers who do not use it.
 */

const checkoutSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  // Digits typed on a Bangla keyboard are turned into 0-9 before anything is
  // checked, so "০১৭১২৩৪৫৬৭৮" passes as the number it is and is stored the way
  // the courier and the fraud check read numbers.
  phone: z
    .string()
    .trim()
    .transform((value) => latinDigits(value))
    .pipe(
      z
        .string()
        .min(6, 'Enter your phone number')
        .max(20, 'That phone number is too long')
        .regex(/^[+\d][\d\s-]{5,}$/, 'Enter a phone number with digits only')
    ),
  email: z
    .union([z.literal(''), z.email('Enter a valid email address')])
    .optional(),
  address: z.string().trim().min(5, 'Enter your full address').max(200),
  city: z.string().trim().min(2, 'Enter your city or district').max(100),
  countryCode: z.string().trim().length(2).toUpperCase(),
  note: z.string().trim().max(500).optional(),
  shippingRateId: z.string().max(40).optional(),
  paymentProvider: z.enum(['CASH_ON_DELIVERY', 'MANUAL']),
})

export type CheckoutInput = z.input<typeof checkoutSchema>

export type CheckoutResult =
  | { ok: true; redirect: string; orderNumber: string }
  | { ok: false; error: string; field?: keyof CheckoutInput }

/** Bangladeshi mobile numbers, in any of the ways people write them. */
const BD_MOBILE = /^(?:\+?88)?01[3-9]\d{8}$/

export async function placeStoreOrderAction(
  input: CheckoutInput
): Promise<CheckoutResult> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store) {
    return { ok: false, error: DEFAULT_STORE_TEXT.words.errors.noStore }
  }
  const text = storeText(store.theme)
  const errors = text.words.errors
  if (!token) {
    return { ok: false, error: errors.cartExpiredAddAgain }
  }

  const ip = await getClientIp()
  const limit = await checkRateLimit(
    `store-checkout:${store.id}:${ip}`,
    10,
    300
  )
  if (!limit.allowed) {
    return { ok: false, error: errors.tooManyAttemptsWait }
  }

  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue ? checkoutIssueMessage(issue, text) : errors.invalid,
      field: issue?.path[0] as keyof CheckoutInput | undefined,
    }
  }
  const details = parsed.data

  const digits = details.phone.replace(/[\s-]/g, '')
  if (details.countryCode === 'BD' && !BD_MOBILE.test(digits)) {
    return {
      ok: false,
      error: errors.elevenDigitMobile,
      field: 'phone',
    }
  }

  // Offered methods only. A posted provider the merchant has switched off is
  // refused here rather than quietly placed under a method they do not take.
  const methods = await listCheckoutPaymentMethods(store.organizationId)
  if (!methods.some((method) => method.provider === details.paymentProvider)) {
    return {
      ok: false,
      error: errors.choosePayment,
      field: 'paymentProvider',
    }
  }

  try {
    await setCartCheckoutDetails(store.organizationId, token, {
      phone: digits,
      email: details.email || null,
      note: details.note || null,
      shippingAddress: {
        firstName: details.name,
        address1: details.address,
        city: details.city,
        countryCode: details.countryCode,
        phone: digits,
      },
    })
    if (details.shippingRateId) {
      await setCartShippingRate(
        store.organizationId,
        token,
        details.shippingRateId
      )
    }

    // A signed-in shopper's order belongs in their account. Attached here,
    // at the last moment, so a cart started before signing in still counts.
    const customer = await requestCustomer(store.organizationId)
    if (customer) {
      await attachCartToCustomer(store.organizationId, token, customer.id)
    }

    const result = await placeOrder(store.organizationId, {
      cartToken: token,
      paymentProvider: details.paymentProvider,
    })

    await clearCartToken()
    ;(await cookies()).set(LAST_ORDER_COOKIE, result.orderId, {
      ...storefrontCookieOptions,
      maxAge: 60 * 60 * 24,
    })

    if (result.reportPurchase) {
      await reportPurchase(store.id, result.orderId, ip)
    }

    return {
      ok: true,
      redirect: '/checkout/thank-you',
      orderNumber: result.orderNumber,
    }
  } catch (cause) {
    // Checkout failures are the shopper's business — "only 2 left", "we do
    // not deliver there" — so the message is passed through as it is, on a
    // shop that speaks the language it is written in. A Bangla shop gets its
    // own sentence instead: precise English helps nobody who cannot read it.
    console.error(`Store checkout failed for ${store.id}:`, cause)
    return {
      ok: false,
      error:
        text.language === 'en' && cause instanceof Error && cause.message
          ? cause.message
          : errors.couldNotPlace,
    }
  }
}

/**
 * Tells the store's ad accounts about the sale. Never in a way that can
 * affect it: `queuePurchaseConversion` swallows its own failures, because a
 * lost conversion is a far smaller problem than a lost order.
 */
async function reportPurchase(storeId: string, orderId: string, ip: string) {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()])
  await queuePurchaseConversion({
    storeId,
    orderId,
    sourceUrl:
      headerList.get('referer') ?? `https://${headerList.get('host') ?? ''}`,
    request: {
      headers: headerList,
      cookies: cookieStore,
      ip: ip === 'unknown' ? null : ip,
      userAgent: headerList.get('user-agent'),
    },
  })
}
