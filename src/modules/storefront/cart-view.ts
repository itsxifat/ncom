import type { CartWithPricing } from '@/server/services/cartService'
import type { CartView } from './cart-types'

/**
 * A priced cart, narrowed to what the storefront draws.
 *
 * Shared by the cart actions and the server-rendered cart page, so the drawer
 * and the page can never describe the same cart two different ways.
 */
export function toCartView(cart: CartWithPricing): CartView {
  const unavailable = new Set(cart.unavailableLineIds)
  const priced = new Map(cart.pricing.lines.map((line) => [line.id, line]))

  return {
    count: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    currencyCode: cart.currencyCode,
    lines: cart.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      title: line.title,
      variantTitle:
        line.variantTitle && line.variantTitle !== 'Default Title'
          ? line.variantTitle
          : '',
      handle: line.handle,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents:
        priced.get(line.id)?.subtotalCents ??
        line.unitPriceCents * line.quantity,
      unavailable: unavailable.has(line.id),
    })),
    subtotalCents: cart.pricing.subtotalCents,
    discountCents: cart.pricing.discountTotalCents,
    discountCode: cart.discountCode,
    discountRejection: cart.discountCode
      ? cart.pricing.discountRejectionReason
      : null,
  }
}
