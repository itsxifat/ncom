import { notFound } from 'next/navigation'
import { Truck } from 'lucide-react'
import { trackParcelByToken } from '@/server/services/courierService'
import {
  SHIPMENT_STATUS_LABEL,
  WORKFLOW_STATE_LABEL,
} from '@/server/courier/statusMap'
import { formatMoney } from '@/lib/money'
import { ProductThumb } from '@/components/media/product-thumb'

export const metadata = { title: 'Track your delivery' }

// Always fresh. The whole promise of this page is that it reflects what the
// courier said a moment ago, and a cached copy of a delivery status is worse
// than no page at all.
export const dynamic = 'force-dynamic'

/**
 * The customer's delivery tracking page.
 *
 * Reachable by unguessable link and nothing else — a cash-on-delivery buyer has
 * no account here, so there is no session to authenticate and the URL is the
 * credential. It is minted at dispatch and mailed to them.
 *
 * What it shows is bounded by that: the order number, what is in the parcel,
 * what is owed at the door, and everything the courier has reported. It does
 * not show the address or the phone number, because the link may be forwarded,
 * pasted into a chat, or read over someone's shoulder, and none of those should
 * disclose where the buyer lives.
 */
export default async function TrackPage({
  params,
}: PageProps<'/track/[token]'>) {
  const { token } = await params
  const parcel = await trackParcelByToken(token)

  if (!parcel) notFound()

  const courier = parcel.courier
  // `workflowState` here is already the merged status — see lib/order-status.ts
  // and trackParcelByToken.
  const cancelled = parcel.workflowState === 'CANCELLED'

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{parcel.storeName}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Order {parcel.orderNumber}
        </h1>
        <p className="text-muted-foreground text-sm">
          Placed {parcel.placedAt.toLocaleDateString()}
        </p>
      </header>

      <section className="rounded-xl border p-5">
        <div className="flex items-center gap-3">
          <Truck className="size-5 shrink-0" />
          <div className="min-w-0">
            {/* The parcel's own status is the more precise answer while it is
                moving, but a cancellation outranks it: a consignment that was
                never withdrawn at the courier goes on reporting "Accepted by
                courier" for days, and telling a buyer their cancelled order is
                on its way is the one thing this page must not do. What the
                courier said is still below, in Progress. */}
            <p className="font-medium">
              {courier && !cancelled
                ? SHIPMENT_STATUS_LABEL[courier.status]
                : WORKFLOW_STATE_LABEL[parcel.workflowState]}
            </p>
            {courier?.statusMessage && (
              <p className="text-muted-foreground text-sm text-pretty">
                {courier.statusMessage}
              </p>
            )}
          </div>
        </div>

        {courier?.trackingCode && (
          <p className="text-muted-foreground mt-3 text-sm">
            Tracking code{' '}
            <code className="text-foreground">{courier.trackingCode}</code>
            {courier.trackingUrl && (
              <>
                {' · '}
                <a
                  href={courier.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  View on the courier&rsquo;s site
                </a>
              </>
            )}
          </p>
        )}

        {/* Nothing is owed on a cancelled order, and asking a buyer to keep
            cash ready for a rider who is not coming is worse than silence. */}
        {!cancelled && parcel.amountDueCents > 0 && (
          <p className="mt-3 text-sm">
            Please have{' '}
            <strong>
              {formatMoney(parcel.amountDueCents, parcel.currencyCode)}
            </strong>{' '}
            ready for the rider.
          </p>
        )}
      </section>

      {/* The courier's own words, newest first. The rider's notes are the
          reason anyone reloads this page — "customer asked to deliver
          tomorrow" is what stops the next phone call. */}
      {courier && courier.events.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Progress
          </h2>
          <ol className="flex flex-col gap-3">
            {courier.events.map((event) => (
              <li key={event.id} className="flex gap-3 text-sm">
                <span
                  className="bg-border mt-1.5 size-2 shrink-0 rounded-full"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-pretty">
                    {event.message || SHIPMENT_STATUS_LABEL[event.status]}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {event.occurredAt.toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          In this parcel
        </h2>
        <ul className="flex flex-col gap-2">
          {parcel.items.map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <ProductThumb src={item.imageUrl} alt={item.title} size="sm" />
              <span className="min-w-0 flex-1 text-pretty">{item.title}</span>
              <span className="text-muted-foreground shrink-0">
                ×{item.quantity}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
