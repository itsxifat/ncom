import type { StockState } from './types'

/**
 * Whether something can be sold right now.
 *
 * The one rule the whole system asks: an untracked line never runs out, a
 * back-order policy sells past zero, and everything else is arithmetic against
 * the merchant's own count. It lives alone in a module with no imports beyond a
 * type so the storefront, the checkout, the cart and the offer resolver all
 * reach the identical answer — two places deciding "in stock" differently is how
 * a page offers what checkout then refuses.
 */
export function isSellable(state: StockState, quantity = 1): boolean {
  if (state.available === null) return true
  if (state.policy === 'CONTINUE') return true
  return state.available >= quantity
}
