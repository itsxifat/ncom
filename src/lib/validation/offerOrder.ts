import { z } from 'zod'

/**
 * A landing-page offer order.
 *
 * Unauthenticated, from anyone on the internet, so this is a trust boundary in
 * the same class as the cart schemas — and note what it refuses to accept: no
 * price, no discount, no delivery charge, no total. The buyer says which page,
 * which offer, which variants and how many, plus where to send it. Every figure
 * is derived server-side by offerService and checkoutService from those
 * choices.
 *
 * `storeId` and `pageId` are not the authority on where the order belongs
 * either: the route resolves the store from the request's own hostname and the
 * page from that store, and uses these only to detect a mismatch.
 */

const selectionSchema = z.object({
  productId: z.string().min(1).max(40),
  variantId: z.string().min(1).max(40),
  quantity: z.coerce.number().int().min(1).max(100),
})

export const offerOrderSchema = z.object({
  storeId: z.string().min(1).max(40),
  pageId: z.string().min(1).max(40),
  offerKey: z.string().min(1).max(60),

  /**
   * What the buyer picked. Capped because a landing page sells a handful of
   * things — a submission with hundreds of lines is a script, not a customer,
   * and the pricing work it would trigger is the expensive part.
   */
  selections: z.array(selectionSchema).min(1).max(50),

  name: z.string().trim().min(1, 'Your name is required').max(120),
  // Loose on format by design: this platform's buyers are in markets where
  // numbers are written +8801…, 8801… and 01… interchangeably, and a strict
  // pattern here rejects real customers. Length is the only real guard.
  phone: z.string().trim().min(6, 'A valid phone number is required').max(30),
  email: z
    .union([z.email(), z.literal('')])
    .optional()
    .transform((value) => value || undefined),

  address: z.string().trim().min(1, 'A delivery address is required').max(300),
  city: z.string().trim().min(1, 'A city or district is required').max(100),
  countryCode: z.string().trim().length(2).toUpperCase().default('BD'),

  /** Which delivery area they chose. Checked against the page's own rates. */
  shippingRateId: z
    .string()
    .max(40)
    .optional()
    .transform((value) => value || undefined),

  /**
   * A code the buyer typed. Only a *claim* — the server looks the rule up, tests
   * it against the basket it just priced, and ignores anything that does not
   * qualify. Nothing about what it is worth is accepted from here.
   */
  discountCode: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || undefined),

  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => value || undefined),
})

export type OfferOrderInput = z.infer<typeof offerOrderSchema>
