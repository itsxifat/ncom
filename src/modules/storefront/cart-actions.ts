'use server'

import {
  addToCart,
  applyDiscountCode,
  countCartItems,
  getCart,
  getOrCreateCart,
  removeDiscountCode,
  updateCartLine,
} from '@/server/services/cartService'
import { priceCartById } from '@/server/services/pricingService'
import { addToCartSchema, updateCartLineSchema } from '@/lib/validation/cart'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import {
  readCartToken,
  requestStore,
  writeCartToken,
} from '@/server/storefront/request'
import type { CartView } from './cart-types'
import { toCartView } from './cart-view'
import { DEFAULT_STORE_TEXT, storeText, type StoreText } from './i18n'

/**
 * The cart, for an online store's shoppers.
 *
 * These run for strangers, so the cart token in an httpOnly cookie on the
 * store's own hostname is the only credential, and the store is whatever that
 * hostname says it is (see `requestStore`). Nothing here accepts a price: the
 * client names a variant and a quantity, and every figure that comes back was
 * computed by the pricing engine in this request.
 *
 * Writes are rate limited per address. They are unauthenticated database
 * writes, which makes them the cheapest way to put load on the platform, and a
 * discount code box with no limit is an oracle for a store's live promotions.
 */

type Result = { ok: true; cart: CartView } | { ok: false; error: string }

// No store means no language to answer in, so this one stays English.
const NO_STORE = DEFAULT_STORE_TEXT.words.errors.noStore

export async function cartSummaryAction(): Promise<{ count: number }> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store || !token) return { count: 0 }
  return { count: await countCartItems(store.organizationId, token) }
}

export async function cartAction(): Promise<CartView | null> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store || !token) return null
  const cart = await getCart(store.organizationId, token)
  return cart ? toCartView(cart) : null
}

export async function addToCartAction(input: {
  variantId: string
  productId?: string
  quantity: number
}): Promise<Result> {
  const store = await requestStore()
  if (!store) return { ok: false, error: NO_STORE }
  const text = storeText(store.theme)

  const ip = await getClientIp()
  const limit = await checkRateLimit(`cart-add:${store.id}:${ip}`, 60, 60)
  if (!limit.allowed) {
    return { ok: false, error: text.words.errors.tooManyRequests }
  }

  const parsed = addToCartSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: invalid(parsed.error.issues, text) }
  }

  try {
    const existing = await readCartToken()
    const cart = await getOrCreateCart(store.organizationId, existing, {
      storeId: store.id,
    })
    if (cart.token !== existing) await writeCartToken(cart.token)
    const priced = await addToCart(
      store.organizationId,
      cart.token,
      parsed.data
    )
    return { ok: true, cart: toCartView(priced) }
  } catch (cause) {
    return {
      ok: false,
      error: message(cause, text.words.errors.couldNotAdd, text),
    }
  }
}

export async function updateCartLineAction(input: {
  lineId: string
  quantity: number
}): Promise<Result> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store) return { ok: false, error: NO_STORE }
  const text = storeText(store.theme)
  if (!token) return { ok: false, error: text.words.errors.cartExpired }

  const parsed = updateCartLineSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: invalid(parsed.error.issues, text) }
  }

  try {
    const priced = await updateCartLine(
      store.organizationId,
      token,
      parsed.data
    )
    return { ok: true, cart: toCartView(priced) }
  } catch (cause) {
    return {
      ok: false,
      error: message(cause, text.words.errors.couldNotUpdate, text),
    }
  }
}

export async function applyDiscountAction(code: string): Promise<Result> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store) return { ok: false, error: NO_STORE }
  const text = storeText(store.theme)
  if (!token) return { ok: false, error: text.words.errors.addSomethingFirst }

  const ip = await getClientIp()
  const limit = await checkRateLimit(`cart-code:${store.id}:${ip}`, 20, 60)
  if (!limit.allowed) {
    return { ok: false, error: text.words.errors.tooManyAttempts }
  }

  const trimmed = code.trim().slice(0, 60)
  if (!trimmed) return { ok: false, error: text.words.errors.enterCode }

  try {
    const priced = await applyDiscountCode(store.organizationId, token, trimmed)
    return { ok: true, cart: toCartView(priced) }
  } catch (cause) {
    return {
      ok: false,
      error: message(cause, text.words.errors.codeNotValid, text),
    }
  }
}

export async function removeDiscountAction(): Promise<Result> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store || !token) return { ok: false, error: NO_STORE }
  const text = storeText(store.theme)
  try {
    const priced = await removeDiscountCode(store.organizationId, token)
    return { ok: true, cart: toCartView(priced) }
  } catch (cause) {
    return {
      ok: false,
      error: message(cause, text.words.errors.couldNotRemoveCode, text),
    }
  }
}

/**
 * The service's own sentence when the shop speaks English, the shop's own
 * fallback otherwise.
 *
 * The cart and pricing services explain a refusal precisely ("Only 2 left"),
 * but in English. On a Bangla shop a vaguer sentence in Bangla is the better
 * trade: a shopper who cannot read the precise one learns nothing from it.
 */
function message(cause: unknown, fallback: string, text: StoreText): string {
  if (text.language !== 'en') return fallback
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function invalid(issues: { message: string }[], text: StoreText): string {
  return text.language === 'en'
    ? (issues[0]?.message ?? text.words.errors.invalid)
    : text.words.errors.invalid
}

export interface CheckoutQuote {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  /** Set when the store has no delivery rate for this destination. */
  shippingUnavailable: boolean
}

/**
 * What the order will come to with this delivery rate, priced by the server.
 *
 * The checkout asks again whenever the shopper picks a rate or applies a code,
 * rather than adding the numbers up in the browser: a free-delivery code, a
 * tax rule or a rate that stops applying above a basket size would each make
 * the browser's sum disagree with the order the shopper is about to place.
 */
export async function checkoutQuoteAction(input: {
  shippingRateId: string | null
  countryCode: string
}): Promise<CheckoutQuote | null> {
  const [store, token] = await Promise.all([requestStore(), readCartToken()])
  if (!store || !token) return null
  const cart = await getCart(store.organizationId, token)
  if (!cart) return null
  const priced = await priceCartById(cart.id, {
    shippingRateId: input.shippingRateId,
    countryCode: input.countryCode.slice(0, 2).toUpperCase(),
  })
  return {
    subtotalCents: priced.subtotalCents,
    discountCents: priced.discountTotalCents,
    shippingCents: priced.shippingTotalCents,
    taxCents: priced.taxTotalCents,
    totalCents: priced.totalCents,
    shippingUnavailable: priced.shippingUnavailable,
  }
}
