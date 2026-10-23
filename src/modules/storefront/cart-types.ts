/**
 * A cart as the storefront draws it.
 *
 * Kept apart from the actions so client components can import the type
 * without pulling a `'use server'` module's types through, and narrower than
 * the service's own shape on purpose: no token, no addresses, nothing a page
 * has no reason to hold in the browser.
 */
export interface CartLineView {
  id: string
  variantId: string
  title: string
  /** Empty for a product with no options. */
  variantTitle: string
  handle: string
  imageUrl: string | null
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  /** Sold out, unpublished or removed since it was added. */
  unavailable: boolean
}

export interface CartView {
  count: number
  currencyCode: string
  lines: CartLineView[]
  subtotalCents: number
  discountCents: number
  discountCode: string | null
  /**
   * Why the code earns nothing yet, as pricing's code — `MINIMUM_SUBTOTAL_NOT_MET`.
   * A code rather than a sentence because the cart is built where the shop's
   * language is not to hand; `discountRejectionText` turns it into words, and
   * it is never shown as it is.
   */
  discountRejection: string | null
}
