import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/server/db/client'
import { PageThemeProvider } from '@/modules/sections/theme'
import { resolveStore } from '@/server/services/storefrontRenderService'
import { formatMoney } from '@/lib/money'
import { DEFAULT_THEME } from '@/lib/default-theme'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/checkout/confirmation'>) {
  const { subdomain } = await params
  const query = await searchParams
  const orderId = typeof query.order === 'string' ? query.order : null

  const store = await resolveStore(subdomain)
  if (!store || !orderId) notFound()

  // Scoped to this store's store, so an order id from another tenant cannot
  // be rendered here. The id itself is an unguessable cuid, which is what
  // stands in for a per-order access token.
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    include: { lines: true },
  })
  if (!order) notFound()

  const theme = store.theme ?? DEFAULT_THEME
  const format = (cents: number) => formatMoney(cents, order.currencyCode)

  return (
    <PageThemeProvider theme={theme}>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm tracking-wide uppercase opacity-60">
          Order {order.orderNumber}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          Thank you for your order
        </h1>
        <p className="mt-3 opacity-80">
          A confirmation has been sent to {order.email}.
          {order.financialStatus === 'PENDING' &&
            ' Your order will be processed once payment is received.'}
        </p>

        <ul className="mt-10 flex flex-col divide-y">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{line.title}</p>
                {line.variantTitle && line.variantTitle !== 'Default Title' && (
                  <p className="text-sm opacity-70">{line.variantTitle}</p>
                )}
                <p className="text-sm opacity-70">Qty {line.quantity}</p>
              </div>
              <span>{format(line.totalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-6 flex flex-col gap-1.5 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="opacity-70">Subtotal</dt>
            <dd>{format(order.subtotalCents)}</dd>
          </div>
          {order.discountTotalCents > 0 && (
            <div className="flex justify-between">
              <dt className="opacity-70">Discount</dt>
              <dd>−{format(order.discountTotalCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="opacity-70">Shipping</dt>
            <dd>{format(order.shippingTotalCents)}</dd>
          </div>
          {order.taxTotalCents > 0 && (
            <div className="flex justify-between">
              <dt className="opacity-70">Tax</dt>
              <dd>{format(order.taxTotalCents)}</dd>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd>{format(order.totalCents)}</dd>
          </div>
        </dl>

        <Link href="/" className="mt-10 inline-block underline">
          Continue shopping
        </Link>
      </div>
    </PageThemeProvider>
  )
}
