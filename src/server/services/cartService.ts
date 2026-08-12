import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { priceCartById, type PricedCart } from './pricingService'
import { getAvailability } from './inventoryService'
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
  lines: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          product: {
            select: {
              title: true,
              handle: true,
              status: true,
              images: {
                orderBy: { position: 'asc' as const },
                take: 1,
                include: { media: { select: { url: true } } },
              },
            },
          },
        },
      },
    },
  },
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

  // Scoping the variant lookup through product.organizationId is what stops a
  // crafted request adding another store's product to this cart.
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: input.variantId,
      product: { organizationId, status: 'ACTIVE' },
    },
    select: {
      id: true,
      priceCents: true,
      inventoryTracked: true,
      inventoryPolicy: true,
    },
  })
  if (!variant) throw new Error('This product is no longer available')

  const existingLine = await prisma.cartLine.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    select: { id: true, quantity: true },
  })

  const desiredQuantity = (existingLine?.quantity ?? 0) + input.quantity

  await assertPurchasable(variant, desiredQuantity)

  if (existingLine) {
    await prisma.cartLine.update({
      where: { id: existingLine.id },
      data: {
        quantity: desiredQuantity,
        unitPriceCents: variant.priceCents,
        properties: input.properties ?? undefined,
      },
    })
  } else {
    await prisma.cartLine.create({
      data: {
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
    include: {
      variant: {
        select: {
          id: true,
          inventoryTracked: true,
          inventoryPolicy: true,
          priceCents: true,
        },
      },
    },
  })
  if (!line) throw new Error('Cart line not found')

  if (input.quantity === 0) {
    await prisma.cartLine.delete({ where: { id: line.id } })
  } else {
    await assertPurchasable(line.variant, input.quantity)
    await prisma.cartLine.update({
      where: { id: line.id },
      data: {
        quantity: input.quantity,
        unitPriceCents: line.variant.priceCents,
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
 * Rejects a quantity that stock cannot cover.
 *
 * This is a courtesy check for a useful error message, not the guarantee —
 * between here and checkout another shopper can take the last unit. The real
 * protection is the conditional decrement in
 * inventoryService.commitInventoryForOrder, which runs inside the checkout
 * transaction.
 */
async function assertPurchasable(
  variant: {
    id: string
    inventoryTracked: boolean
    inventoryPolicy: 'DENY' | 'CONTINUE'
  },
  quantity: number
) {
  if (!variant.inventoryTracked || variant.inventoryPolicy === 'CONTINUE')
    return

  const availability = await getAvailability([variant.id])
  const available = availability.get(variant.id) ?? 0

  if (available < quantity) {
    throw new Error(
      available > 0
        ? `Only ${available} left in stock`
        : 'This item is out of stock'
    )
  }
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

async function decorateCart(cart: CartRow): Promise<CartWithPricing> {
  const pricing = await priceCartById(cart.id)

  const trackedVariantIds = cart.lines
    .filter(
      (line) =>
        line.variant.inventoryTracked && line.variant.inventoryPolicy === 'DENY'
    )
    .map((line) => line.variantId)

  const availability = await getAvailability(trackedVariantIds)

  const unavailableLineIds = cart.lines
    .filter((line) => {
      // A product unpublished after the item was added is as unavailable as
      // one that sold out.
      if (line.variant.product.status !== 'ACTIVE') return true
      if (!trackedVariantIds.includes(line.variantId)) return false
      return (availability.get(line.variantId) ?? 0) < line.quantity
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
    lines: cart.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      quantity: line.quantity,
      title: line.variant.product.title,
      variantTitle: line.variant.title,
      handle: line.variant.product.handle,
      sku: line.variant.sku,
      imageUrl: line.variant.product.images[0]?.media.url ?? null,
      unitPriceCents: line.variant.priceCents,
      properties: line.properties,
    })),
    pricing,
    unavailableLineIds,
  }
}
