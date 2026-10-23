/**
 * An order's progress, in the words a shopper uses.
 *
 * The workspace has eleven delivery states because a merchant acts on every
 * one of them; a shopper only wants to know whether it is coming. "Needs
 * review" — the merchant checking a risky order — is still "Order placed" to
 * the person who placed it, and saying otherwise would read as an accusation.
 */
export const CUSTOMER_ORDER_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'progress' | 'done' | 'stopped' }
> = {
  PENDING: { label: 'Order placed', tone: 'neutral' },
  FRAUD_REVIEW: { label: 'Order placed', tone: 'neutral' },
  PROCESSING: { label: 'Being packed', tone: 'progress' },
  DISPATCHED: { label: 'Sent to courier', tone: 'progress' },
  IN_TRANSIT: { label: 'On the way', tone: 'progress' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'progress' },
  DELIVERED: { label: 'Delivered', tone: 'done' },
  PARTIALLY_DELIVERED: { label: 'Partly delivered', tone: 'done' },
  RETURNED: { label: 'Returned', tone: 'stopped' },
  CANCELLED: { label: 'Cancelled', tone: 'stopped' },
  FAILED: { label: 'Delivery failed', tone: 'stopped' },
}

export const STATUS_TONE_CLASS = {
  neutral: 'bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]',
  progress: 'bg-sky-500/12 text-sky-800',
  done: 'bg-emerald-500/12 text-emerald-800',
  stopped: 'bg-red-500/10 text-red-700',
} as const
