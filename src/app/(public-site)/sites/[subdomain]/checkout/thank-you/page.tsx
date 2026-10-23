import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CheckCircle2 } from 'lucide-react'
import { prisma } from '@/server/db/client'
import {
  renderSitePage,
  storeChrome,
  storeForRoute,
  storeScreenMetadata,
} from '@/server/storefront/site-page'
import { StoreDocument } from '@/server/storefront/store-page'
import { builtInName, storeText } from '@/modules/storefront/i18n'
import { LAST_ORDER_COOKIE } from '@/modules/storefront/checkout-shared'
import { cn } from '@/lib/utils'
import {
  hairline,
  headingFont,
  muted,
  panel,
  primaryButton,
} from '@/modules/storefront/ui'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/checkout/thank-you'>): Promise<Metadata> {
  const { subdomain } = await params
  return storeScreenMetadata(
    subdomain,
    ['checkout', 'thank-you'],
    (words) => words.thankYouTitle
  )
}

/**
 * The confirmation after an order.
 *
 * Shows the order this device just placed, found by the cookie checkout left
 * — never by an id in the address, because this page shows where the buyer
 * lives. Opened anywhere else it simply says thank you.
 */
export default async function ThankYouPage({
  params,
}: PageProps<'/sites/[subdomain]/checkout/thank-you'>) {
  const { subdomain } = await params
  const store = await storeForRoute(subdomain)
  if (!store) return renderSitePage(subdomain, ['checkout', 'thank-you'])

  const orderId = (await cookies()).get(LAST_ORDER_COOKIE)?.value
  const [{ layout, storefront, theme }, order] = await Promise.all([
    storeChrome(store),
    orderId
      ? prisma.order.findFirst({
          where: { id: orderId, organizationId: store.organizationId },
          select: {
            orderNumber: true,
            totalCents: true,
            subtotalCents: true,
            discountTotalCents: true,
            shippingTotalCents: true,
            currencyCode: true,
            phone: true,
            shippingAddress: true,
            shippingMethodTitle: true,
            lines: {
              select: {
                id: true,
                title: true,
                variantTitle: true,
                imageUrl: true,
                quantity: true,
                totalCents: true,
              },
            },
          },
        })
      : null,
  ])

  const { words, price } = storeText(theme)
  const address = (order?.shippingAddress ?? null) as {
    firstName?: string
    address1?: string
    city?: string
  } | null

  return (
    <StoreDocument
      theme={theme}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      bottom={layout.bottom}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-14">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2
            className="size-14 text-emerald-600"
            strokeWidth={1.5}
          />
          <h1
            className={cn('text-3xl font-semibold tracking-tight', headingFont)}
          >
            {words.thankYou(address?.firstName ?? null)}
          </h1>
          <p className={cn('max-w-md', muted)}>
            {order
              ? words.orderPlacedCall(order.orderNumber, order.phone)
              : words.orderPlaced}
          </p>
        </div>

        {order && (
          <div className={cn(panel, 'flex flex-col gap-4 p-6')}>
            <ul className="flex flex-col gap-3">
              {order.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]">
                    {line.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- merchant CDN
                      <img
                        src={line.imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.title}</p>
                    <p className={cn('text-xs', muted)}>
                      {line.variantTitle &&
                      line.variantTitle !== 'Default Title'
                        ? `${line.variantTitle} · `
                        : ''}
                      {words.quantityShort(line.quantity)}
                    </p>
                  </div>
                  <span className="text-sm font-medium">
                    {price(line.totalCents, order.currencyCode)}
                  </span>
                </li>
              ))}
            </ul>
            <dl
              className={cn(
                'flex flex-col gap-1.5 border-t pt-4 text-sm',
                hairline
              )}
            >
              <div className="flex justify-between">
                <dt className={muted}>{words.subtotal}</dt>
                <dd>{price(order.subtotalCents, order.currencyCode)}</dd>
              </div>
              {order.discountTotalCents > 0 && (
                <div className="flex justify-between">
                  <dt className={muted}>{words.discount}</dt>
                  <dd>
                    −{price(order.discountTotalCents, order.currencyCode)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className={muted}>
                  {order.shippingMethodTitle
                    ? words.deliveryVia(
                        builtInName(order.shippingMethodTitle, words)
                      )
                    : words.delivery}
                </dt>
                <dd>
                  {order.shippingTotalCents === 0
                    ? words.free
                    : price(order.shippingTotalCents, order.currencyCode)}
                </dd>
              </div>
              <div
                className={cn(
                  'mt-1 flex justify-between border-t pt-3 text-base font-semibold',
                  hairline
                )}
              >
                <dt>{words.totalToPay}</dt>
                <dd>{price(order.totalCents, order.currencyCode)}</dd>
              </div>
            </dl>
            {address?.address1 && (
              <p className={cn('border-t pt-4 text-sm', hairline, muted)}>
                {words.deliveringTo(
                  address.city
                    ? `${address.address1}, ${address.city}`
                    : address.address1
                )}
              </p>
            )}
          </div>
        )}

        {/* A storefront path on the tenant's own host, not a dashboard route —
                a full page load is what crosses the store's rewrite. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/products" className={cn(primaryButton, 'self-center')}>
          {words.continueShopping}
        </a>
      </div>
    </StoreDocument>
  )
}
