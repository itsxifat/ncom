import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { priceCartById, type PricedCart } from './pricingService'
import {
  getStock,
  isSellable,
  resolveVariants,
  type StockState,
} from '@/server/catalog'
import type {
  AddToCartInput,
  CartContactInput,
  UpdateCartLineInput,
} from '@/lib/validation/cart'
import type { AddressInput } from '@/lib/validation/address'

/**
 * Cart operations, called from the public storefront.
 *
 * Unlike the admin services these take no organizationId and perform no RBAC
 * check — the caller is an anonymous shopper. Authorization is by possession
 * of the cart token, so every query is scoped by BOTH token and organizationId. The
 * organizationId half is not optional: without it a token leaked from one store
 * could be replayed against another, and carts are addressed by a value that
 * travels in a cookie.
 *
 * Carts are never priced by the client. Every mutation returns a freshly
 * computed PricedCart from pricingService.
 *
 * Nothing about the goods is stored on the cart beyond the merchant's own ids
 * and a display snapshot. Title, price, image and stock are read from the
 * merchant's website on every render — a cart open in a tab for an hour shows
 * what their shop says right now, not what it said when the shopper started.
 */

/** Abandoned carts stop being reachable after this, freeing their tokens. */
const CART_TTL_DAYS = 30

export interface CartWithPricing {
  id: string
  token: string
  currencyCode: string
  email: string | null
  note: string | null
  discountCode: string | null
  shippingRateId: string | null
  shippingAddress: unknown
  billingAddress: unknown
  lines: {
    id: string
    variantId: string
    quantity: number
    title: string
    variantTitle: string
    handle: string
    sku: string | null
    imageUrl: string | null
    unitPriceCents: number
    properties: unknown
  }[]
  pricing: PricedCart
  /** Lines whose stock ran out while the cart sat idle. */
  unavailableLineIds: string[]
}

const CART_INCLUDE = {
  lines: { orderBy: { createdAt: 'asc' as const } },
} as const

export async function getOrCreateCart(
  organizationId: string,
  token: string | null
): Promise<{ id: string; token: string }> {
  if (token) {
    const existing = await prisma.cart.findFirst({
      where: { token, organizationId, completedAt: null },
      select: { id: true, token: true },
    })
    if (existing) return existing
  }

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencyCode: true },
  })

  const cart = await prisma.cart.create({
    data: {
      organizationId,
      currencyCode: settings?.currencyCode ?? 'USD',
      expiresAt: new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    select: { id: true, token: true },
  })

  return cart
}

export async function getCart(
  organizationId: string,
  token: string
): Promise<CartWithPricing | null> {
  const cart = await prisma.cart.findFirst({
    where: { token, organizationId, completedAt: null },
    include: CART_INCLUDE,
  })
  if (!cart) return null

  return decorateCart(cart)
}

export async function addToCart(
  organizationId: string,
  token: string,
  input: AddToCartInput
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)

  // Resolved against this organisation's own connected website, which is what
  // stops a crafted request adding another tenant's product to this cart — the
  // connection is per workspace, so a variant id from someone else's shop
  // simply does not resolve here.
  const entry = (
    await resolveVariants(organizationId, [
      { variantId: input.variantId, productId: input.productId ?? null },
    ])
  ).get(input.variantId)

  if (!entry || entry.product.status !== 'ACTIVE') {
    throw new Error('This product is no longer available')
  }

  const { variant, product } = entry

  const existingLine = await prisma.cartLine.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    select: { id: true, quantity: true },
  })

  const desiredQuantity = (existingLine?.quantity ?? 0) + input.quantity

  assertPurchasable(variant, desiredQuantity)

  // The snapshot is rewritten on every add, so a line's description keeps up
  // with a renamed product for as long as anyone touches the cart.
  const snapshot = {
    productId: product.id,
    title: product.title,
    variantTitle: variant.title,
    handle: product.handle,
    sku: variant.sku,
    imageUrl: variant.imageUrl ?? product.images[0]?.url ?? null,
    requiresShipping: variant.requiresShipping,
    weightGrams: variant.weightGrams,
  }

  if (existingLine) {
    await prisma.cartLine.update({
      where: { id: existingLine.id },
      data: {
        ...snapshot,
        quantity: desiredQuantity,
        unitPriceCents: variant.priceCents,
        properties: input.properties ?? undefined,
      },
    })
  } else {
    await prisma.cartLine.create({
      data: {
        ...snapshot,
        cartId: cart.id,
        variantId: variant.id,
        quantity: input.quantity,
        unitPriceCents: variant.priceCents,
        properties: input.properties ?? undefined,
      },
    })
  }

  await touchCart(cart.id)
  return loadDecorated(cart.id)
}

export async function updateCartLine(
  organizationId: string,
  token: string,
  input: UpdateCartLineInput
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)

  const line = await prisma.cartLine.findFirst({
    where: { id: input.lineId, cartId: cart.id },
    select: { id: true, variantId: true, productId: true },
  })
  if (!line) throw new Error('Cart line not found')

  if (input.quantity === 0) {
    await prisma.cartLine.delete({ where: { id: line.id } })
  } else {
    const entry = (
      await resolveVariants(organizationId, [
        { variantId: line.variantId, productId: line.productId },
      ])
    ).get(line.variantId)
    if (!entry) throw new Error('This product is no longer available')

    assertPurchasable(entry.variant, input.quantity)
    await prisma.cartLine.update({
      where: { id: line.id },
      data: {
        quantity: input.quantity,
        unitPriceCents: entry.variant.priceCents,
      },
    })
  }

  await touchCart(cart.id)
  return loadDecorated(cart.id)
}

/**
 * Stores a discount code on the cart.
 *
 * The code is recorded even when it currently earns nothing, and the pricing
 * layer reports why via `discountRejectionReason`. That is what lets the cart
 * say "add $20 more to use SAVE10" rather than rejecting the code outright and
 * losing the shopper's intent.
 */
export async function applyDiscountCode(
  organizationId: string,
  token: string,
  code: string
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)

  const now = new Date()
  const exists = await prisma.discountCode.findFirst({
    where: {
      code: { equals: code, mode: 'insensitive' },
      discount: {
        organizationId,
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    },
    select: { id: true },
  })

  if (!exists) throw new Error('That discount code is not valid')

  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCode: code },
  })

  return loadDecorated(cart.id)
}

export async function removeDiscountCode(
  organizationId: string,
  token: string
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCode: null },
  })
  return loadDecorated(cart.id)
}

export async function setCartContact(
  organizationId: string,
  token: string,
  input: CartContactInput
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)

  await prisma.cart.update({
    where: { id: cart.id },
    data: { email: input.email, note: input.note ?? null },
  })

  return loadDecorated(cart.id)
}

export async function setCartAddresses(
  organizationId: string,
  token: string,
  shippingAddress: AddressInput,
  billingAddress?: AddressInput
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      shippingAddress,
      // Most buyers use one address; defaulting billing to shipping avoids an
      // empty billing address reaching the payment provider.
      billingAddress: billingAddress ?? shippingAddress,
      // A destination change can invalidate the chosen rate, so clear it and
      // let the buyer re-pick rather than silently charging a rate that no
      // longer applies to where the parcel is going.
      shippingRateId: null,
    },
  })

  return loadDecorated(cart.id)
}

export async function setCartShippingRate(
  organizationId: string,
  token: string,
  shippingRateId: string
): Promise<CartWithPricing> {
  const cart = await requireOpenCart(organizationId, token)

  const priced = await priceCartById(cart.id, { shippingRateId })
  const isOffered = priced.availableShippingRates.some(
    (rate) => rate.id === shippingRateId
  )
  if (!isOffered) throw new Error('That shipping rate is not available')

  await prisma.cart.update({
    where: { id: cart.id },
    data: { shippingRateId },
  })

  return loadDecorated(cart.id)
}

/** Attaches a cart to a customer on login, so it survives the session. */
export async function attachCartToCustomer(
  organizationId: string,
  token: string,
  customerId: string
) {
  await prisma.cart.updateMany({
    where: { token, organizationId, completedAt: null },
    data: { customerId },
  })
}

// ── Internals ────────────────────────────────────────────────────────────

async function requireOpenCart(organizationId: string, token: string) {
  const cart = await prisma.cart.findFirst({
    where: { token, organizationId, completedAt: null },
    select: { id: true },
  })
  if (!cart) throw new Error('Cart not found')
  return cart
}

/**
 * Rejects a quantity the merchant's own stock figure cannot cover.
 *
 * A courtesy check for a useful error message, not a guarantee — between here
 * and checkout another shopper can take the last unit, and that race is now
 * settled on the merchant's side rather than ours. The real protection is the
 * reservation checkout asks their site for; where a site does not implement
 * one, this check plus the re-read at checkout is all there is, which the
 * connector documentation says plainly.
 *
 * Takes the variant it was already given rather than re-reading: the caller
 * resolved it a line ago in this same request, and a second call would be a
 * second round trip to the merchant's server for a number that cannot have
 * changed meaningfully in between.
 */
function assertPurchasable(variant: StockState, quantity: number) {
  if (isSellable(variant, quantity)) return

  const available = variant.available ?? 0
  throw new Error(
    available > 0
      ? `Only ${available} left in stock`
      : 'This item is out of stock'
  )
}

async function touchCart(cartId: string) {
  await prisma.cart.update({
    where: { id: cartId },
    data: {
      expiresAt: new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  })
}

async function loadDecorated(cartId: string): Promise<CartWithPricing> {
  const cart = await prisma.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: CART_INCLUDE,
  })
  return decorateCart(cart)
}

type CartRow = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>

/**
 * Turns cart rows into what a storefront renders, reading the goods live.
 *
 * Three reads happen per cart render — the pricing engine's own resolution, the
 * stock call, and whatever a section asks for — and they are deduplicated
 * within the request, so one render is one round trip per distinct question.
 *
 * A line whose variant no longer resolves is still shown, from its snapshot,
 * and marked unavailable. Dropping it silently would leave a shopper looking at
 * a cart that lost an item with no explanation; pricing has already excluded it
 * from every total.
 */
async function decorateCart(cart: CartRow): Promise<CartWithPricing> {
  const refs = cart.lines.map((line) => ({
    variantId: line.variantId,
    productId: line.productId,
  }))

  const [pricing, resolved, stock] = await Promise.all([
    priceCartById(cart.id),
    resolveVariants(cart.organizationId, refs),
    getStock(cart.organizationId, refs),
  ])

  const unavailableLineIds = cart.lines
    .filter((line) => {
      const entry = resolved.get(line.variantId)
      // Gone from the catalogue, or unpublished after the item was added: both
      // are as unavailable as sold out.
      if (!entry || entry.product.status !== 'ACTIVE') return true

      const state = stock.get(line.variantId) ?? {
        available: entry.variant.available,
        policy: entry.variant.policy,
      }
      return !isSellable(state, line.quantity)
    })
    .map((line) => line.id)

  return {
    id: cart.id,
    token: cart.token,
    currencyCode: cart.currencyCode,
    email: cart.email,
    note: cart.note,
    discountCode: cart.discountCode,
    shippingRateId: cart.shippingRateId,
    shippingAddress: cart.shippingAddress,
    billingAddress: cart.billingAddress,
    lines: cart.lines.map((line) => {
      const entry = resolved.get(line.variantId)
      return {
        id: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
        title: entry?.product.title ?? line.title ?? 'Item',
        variantTitle: entry?.variant.title ?? line.variantTitle ?? '',
        handle: entry?.product.handle ?? line.handle ?? '',
        sku: entry?.variant.sku ?? line.sku ?? null,
        imageUrl:
          entry?.variant.imageUrl ??
          entry?.product.images[0]?.url ??
          line.imageUrl ??
          null,
        // The live price, or the last one the shopper was shown when the item
        // can no longer be read. The line is marked unavailable either way, and
        // pricing has already left it out of the totals — this number is a
        // label on a struck-through row, not a charge.
        unitPriceCents: entry?.variant.priceCents ?? line.unitPriceCents,
        properties: line.properties,
      }
    }),
    pricing,
    unavailableLineIds: [
      ...new Set([...unavailableLineIds, ...pricing.unpricedLineIds]),
    ],
  }
}
