'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db/client'
import {
  addToCart,
  applyDiscountCode,
  getOrCreateCart,
  removeDiscountCode,
  updateCartLine,
} from '@/server/services/cartService'
import { addToCartSchema, updateCartLineSchema } from '@/lib/validation/cart'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import {
  CART_COOKIE_MAX_AGE,
  CART_TOKEN_COOKIE,
  storefrontCookieOptions,
} from '@/lib/storefront-cookies'

/**
 * Storefront cart actions.
 *
 * These run for anonymous visitors, so there is no session to authorize
 * against — the cart token in the cookie is the only credential. Two
 * consequences shape everything here:
 *
 *   - The subdomain is resolved to a storeId server-side and every service
 *     call is scoped by it. A caller cannot name the store they are acting on.
 *   - They are rate limited by IP. Cart endpoints are unauthenticated writes,
 *     which makes them the cheapest way to generate database load on the whole
 *     platform.
 */

export type CartActionState = { error?: string; success?: boolean } | undefined

async function resolveStoreId(subdomain: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { subdomain },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')
  return store.id
}

async function currentCart(storeId: string) {
  const jar = await cookies()
  const existing = jar.get(CART_TOKEN_COOKIE)?.value ?? null

  const cart = await getOrCreateCart(storeId, existing)

  if (cart.token !== existing) {
    jar.set(CART_TOKEN_COOKIE, cart.token, {
      ...storefrontCookieOptions,
      maxAge: CART_COOKIE_MAX_AGE,
    })
  }

  return cart
}

export async function addToCartAction(
  subdomain: string,
  _prev: CartActionState,
  formData: FormData
): Promise<CartActionState> {
  const ip = await getClientIp()
  const limit = await checkRateLimit(`cart-add:${subdomain}:${ip}`, 60, 60)
  if (!limit.allowed) {
    return { error: 'Too many requests — please slow down' }
  }

  const parsed = addToCartSchema.safeParse({
    variantId: formData.get('variantId'),
    quantity: Number(formData.get('quantity') ?? 1),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid request' }
  }

  try {
    const storeId = await resolveStoreId(subdomain)
    const cart = await currentCart(storeId)
    await addToCart(storeId, cart.token, parsed.data)
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not add to cart',
    }
  }

  revalidatePath('/cart')
  return { success: true }
}

export async function updateCartLineAction(
  subdomain: string,
  _prev: CartActionState,
  formData: FormData
): Promise<CartActionState> {
  const parsed = updateCartLineSchema.safeParse({
    lineId: formData.get('lineId'),
    quantity: Number(formData.get('quantity') ?? 0),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid request' }
  }

  try {
    const storeId = await resolveStoreId(subdomain)
    const cart = await currentCart(storeId)
    await updateCartLine(storeId, cart.token, parsed.data)
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not update cart',
    }
  }

  revalidatePath('/cart')
  return { success: true }
}

export async function applyDiscountAction(
  subdomain: string,
  _prev: CartActionState,
  formData: FormData
): Promise<CartActionState> {
  const ip = await getClientIp()
  const limit = await checkRateLimit(`cart-discount:${subdomain}:${ip}`, 20, 60)
  if (!limit.allowed) {
    // Discount codes are guessable, so a loose limit here is a brute-force
    // oracle for a store's active promotions.
    return { error: 'Too many attempts — please try again shortly' }
  }

  const code = String(formData.get('code') ?? '').trim()
  if (!code) return { error: 'Enter a discount code' }

  try {
    const storeId = await resolveStoreId(subdomain)
    const cart = await currentCart(storeId)
    await applyDiscountCode(storeId, cart.token, code)
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not apply code',
    }
  }

  revalidatePath('/cart')
  return { success: true }
}

export async function removeDiscountAction(
  subdomain: string
): Promise<CartActionState> {
  try {
    const storeId = await resolveStoreId(subdomain)
    const cart = await currentCart(storeId)
    await removeDiscountCode(storeId, cart.token)
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not remove code',
    }
  }

  revalidatePath('/cart')
  return { success: true }
}
