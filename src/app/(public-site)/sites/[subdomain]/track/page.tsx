import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveStore } from '@/server/services/storefrontRenderService'
import { trackParcelPublicly } from '@/server/services/courierService'
import { PageThemeProvider } from '@/modules/sections/theme'
import { DEFAULT_THEME } from '@/lib/default-theme'
import {
  SHIPMENT_STATUS_LABEL,
  WORKFLOW_STATE_LABEL,
} from '@/server/courier/statusMap'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Track your order',
  // Nothing here should be indexed: every useful URL carries a customer's
  // order number and phone number as query parameters.
  robots: { index: false, follow: false },
}

/**
 * Customer-facing parcel tracking.
 *
 * Two facts are required — the order number and the phone number the order was
 * placed with — and both are checked server-side before anything is shown. The
 * order number alone is not enough: they are sequential, so a page that
 * accepted one would let anyone walk the range and read strangers' orders.
 *
 * A GET form rather than a server action, deliberately. The result lives in the
 * URL, so a customer can bookmark it, re-open it from their browser history and
 * send it to whoever is waiting for the parcel — which is exactly what people
 * do with a tracking page, and what a POST would take away from them.
 */
export default async function TrackPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/track'>) {
  const { subdomain } = await params
  const query = await searchParams

  const store = await resolveStore(subdomain)
  if (!store) notFound()

  const orderNumber = typeof query.order === 'string' ? query.order.trim() : ''
  const phone = typeof query.phone === 'string' ? query.phone.trim() : ''
  const submitted = Boolean(orderNumber && phone)

  const theme = store.theme ?? DEFAULT_THEME

  let result: Awaited<ReturnType<typeof trackParcelPublicly>> = null
  let throttled = false

  if (submitted) {
    // Rate limited per IP. The pair of facts is what protects a customer's
    // order, and without a limit an attacker can simply try phone numbers
    // against a known order number until one answers.
    const ip = await getClientIp()

    const { allowed } = await checkRateLimit(`track:${store.id}:${ip}`, 20, 300)
    if (!allowed) {
      throttled = true
    } else {
      result = await trackParcelPublicly(
        store.organizationId,
        orderNumber,
        phone
      )
    }
  }

  return (
    <PageThemeProvider theme={theme}>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Track your order</h1>
        <p className="mt-3 opacity-80">
          Enter your order number and the mobile number you ordered with.
        </p>

        <form className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            name="order"
            defaultValue={orderNumber}
            placeholder="Order number"
            className="flex-1 rounded-lg border px-3 py-2"
            aria-label="Order number"
            required
          />
          <input
            name="phone"
            defaultValue={phone}
            placeholder="01712345678"
            inputMode="tel"
            className="flex-1 rounded-lg border px-3 py-2"
            aria-label="Mobile number"
            required
          />
          <button
            type="submit"
            className="rounded-lg border px-5 py-2 font-medium"
          >
            Track
          </button>
        </form>

        {throttled && (
          <p className="mt-8 opacity-80">
            Too many lookups from this connection. Please wait a few minutes and
            try again.
          </p>
        )}

        {submitted && !throttled && !result && (
          // One message for "no such order" and "wrong phone number" on
          // purpose — telling them apart confirms which order numbers exist.
          <p className="mt-8 opacity-80">
            We could not find an order with that number and mobile number.
            Please check both and try again.
          </p>
        )}

        {result && (
          <div className="mt-10 flex flex-col gap-6">
            <div>
              <p className="text-sm tracking-wide uppercase opacity-60">
                Order {result.orderNumber}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {result.courier
                  ? SHIPMENT_STATUS_LABEL[result.courier.status]
                  : WORKFLOW_STATE_LABEL[result.workflowState]}
              </p>
              {result.courier?.message && (
                <p className="mt-1 opacity-80">{result.courier.message}</p>
              )}
            </div>

            {result.courier ? (
              <>
                <dl className="flex flex-wrap gap-x-10 gap-y-2 text-sm">
                  <div>
                    <dt className="opacity-60">Courier</dt>
                    <dd className="font-medium">
                      {result.courier.provider === 'STEADFAST'
                        ? 'Steadfast'
                        : 'Pathao'}
                    </dd>
                  </div>
                  {result.courier.trackingCode && (
                    <div>
                      <dt className="opacity-60">Tracking number</dt>
                      <dd className="font-medium">
                        {result.courier.trackingCode}
                      </dd>
                    </div>
                  )}
                  {result.courier.dispatchedAt && (
                    <div>
                      <dt className="opacity-60">Shipped</dt>
                      <dd className="font-medium">
                        {result.courier.dispatchedAt.toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                </dl>

                {result.courier.events.length > 0 && (
                  <ol className="flex flex-col gap-4 border-t pt-6">
                    {result.courier.events.map((event, index) => (
                      <li key={index} className="flex gap-3">
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-current opacity-40"
                          aria-hidden
                        />
                        <div>
                          <p>{event.message}</p>
                          <p className="text-sm opacity-60">
                            {event.occurredAt.toLocaleString()}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {result.courier.trackingUrl && (
                  <a
                    href={result.courier.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    View on the courier&rsquo;s own tracking page
                  </a>
                )}
              </>
            ) : (
              <p className="opacity-80">
                Your order has been received and is being prepared. Tracking
                details will appear here once it is handed to the courier.
              </p>
            )}
          </div>
        )}
      </div>
    </PageThemeProvider>
  )
}
