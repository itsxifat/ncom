import { z } from 'zod'
import { addressSchema } from './address'

/**
 * Cart and checkout input.
 *
 * Everything here arrives from the public storefront — an unauthenticated
 * request from anyone on the internet — so these schemas are the outermost
 * trust boundary of the commerce module. Note what is absent: no price, no
 * discount amount, no total. The client says *what* it wants, never what it
 * costs; every figure is recomputed server-side in pricingService. A cart API
 * that accepts a price from the client is the classic storefront vulnerability.
 */

export const addToCartSchema = z.object({
  // Ids come from the merchant's own system now, so the ceiling is the
  // connector contract's (200 characters) rather than the length of a cuid.
  variantId: z.string().min(1, 'Variant is required').max(200),
  /**
   * The product the variant belongs to. Optional because an older form may not
   * post it, but always sent by anything rendered since the catalogue moved —
   * it is what lets a saved reference be resolved with one products call
   * instead of depending on the connector's optional /variants endpoint.
   */
  productId: z.string().min(1).max(200).optional(),
  quantity: z
    .number()
    .int()
    .min(1, 'Quantity must be at least 1')
    // A per-line ceiling: without one, a single request can reserve a store's
    // entire stock, and quantity * price can overflow past safe integer range.
    .max(1000, 'Quantity is too large'),
  properties: z.record(z.string().max(80), z.string().max(500)).optional(),
})

export type AddToCartInput = z.infer<typeof addToCartSchema>

export const updateCartLineSchema = z.object({
  lineId: z.string().min(1).max(40),
  /** Zero removes the line, matching Shopify's cart/change behaviour. */
  quantity: z.number().int().min(0).max(1000),
})

export type UpdateCartLineInput = z.infer<typeof updateCartLineSchema>

export const applyDiscountSchema = z.object({
  code: z.string().trim().min(1).max(60),
})

export const cartContactSchema = z.object({
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(2000).optional(),
  acceptsMarketing: z.boolean().default(false),
})

export type CartContactInput = z.infer<typeof cartContactSchema>

export const checkoutAddressSchema = z.object({
  shippingAddress: addressSchema,
  /** Falls back to the shipping address when the buyer doesn't enter one. */
  billingAddress: addressSchema.optional(),
})

export const selectShippingRateSchema = z.object({
  shippingRateId: z.string().min(1).max(40),
})

/**
 * The final "place order" payload.
 *
 * `cartToken` identifies the cart; the server re-derives contact details,
 * addresses, lines and totals from the stored cart rather than trusting a
 * resubmitted copy, so a tampered final request cannot change what was priced.
 */
export const placeOrderSchema = z.object({
  cartToken: z.string().min(1).max(40),
  paymentProvider: z.enum([
    'STRIPE',
    'PAYPAL',
    'RAZORPAY',
    'SSLCOMMERZ',
    'BKASH',
    'MANUAL',
    'CASH_ON_DELIVERY',
  ]),
  /**
   * Provider-side reference for an already-authorized payment (a Stripe
   * PaymentIntent id, say). Its amount is verified against the server-computed
   * order total before the order is marked paid — never trusted on its own.
   */
  paymentReference: z.string().trim().max(200).optional(),
})

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
