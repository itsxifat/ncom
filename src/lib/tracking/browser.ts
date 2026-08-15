/**
 * The browser's half of a deduplicated Meta conversion.
 *
 * The server has already reported this purchase and is the copy that cannot be
 * blocked. This one exists because Meta matches a browser event against cookies
 * and a logged-in Facebook session that a server never sees, and a pair of
 * events sharing an `eventID` is collapsed into one — so sending both raises
 * the match rate without raising the count.
 *
 * The payload is not assembled here. It comes back from the order response
 * exactly as the server sent it, because the two copies disagreeing about the
 * total would mean the figure in the merchant's ad reporting is decided by
 * whichever request happened to arrive first.
 */

type Fbq = (...args: unknown[]) => void

declare global {
  interface Window {
    fbq?: Fbq
  }
}

export interface PixelPurchaseMirror {
  eventId: string
  payload: Record<string, unknown>
}

/**
 * Fires the pixel's copy, if there is a pixel to fire it on.
 *
 * Silent when `fbq` is missing — which is both the "no pixel configured" case
 * and the "the buyer blocks Meta" case. Neither is an error, and neither costs
 * the merchant the conversion, because the server already sent it.
 */
export function mirrorPurchaseToPixel(
  mirror: PixelPurchaseMirror | null
): void {
  if (!mirror) return
  if (typeof window === 'undefined') return

  const fbq = window.fbq
  if (typeof fbq !== 'function') return

  try {
    fbq('track', 'Purchase', mirror.payload, { eventID: mirror.eventId })
  } catch {
    // A tag error must never reach the buyer looking at their order number.
  }
}
