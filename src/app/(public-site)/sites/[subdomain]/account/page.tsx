import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { requestCustomer } from '@/server/storefront/request'
import {
  renderSitePage,
  storeChrome,
  storeForRoute,
  storeScreenMetadata,
} from '@/server/storefront/site-page'
import { StoreDocument } from '@/server/storefront/store-page'
import { storeText } from '@/modules/storefront/i18n'
import { LogoutButton } from '@/modules/storefront/AccountForms'
import {
  CUSTOMER_ORDER_STATUS,
  STATUS_TONE_CLASS,
} from '@/modules/storefront/order-status'
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
}: PageProps<'/sites/[subdomain]/account'>): Promise<Metadata> {
  const { subdomain } = await params
  return storeScreenMetadata(
    subdomain,
    ['account'],
    (words) => words.yourAccount
  )
}

/**
 * A shopper's account: who they are and what they have ordered.
 *
 * Signed-out visitors are sent to sign in and brought back here afterwards.
 * Orders are listed with where they are in plain words — "On the way", not
 * "IN_TRANSIT" — and a tracking link once the courier has one.
 */
export default async function AccountPage({
  params,
}: PageProps<'/sites/[subdomain]/account'>) {
  const { subdomain } = await params
  const store = await storeForRoute(subdomain)
  if (!store) return renderSitePage(subdomain, ['account'])

  const customer = await requestCustomer(store.organizationId)
  if (!customer) redirect('/account/login?next=/account')

  const [{ layout, storefront, theme }, orders] = await Promise.all([
    storeChrome(store),
    prisma.order.findMany({
      where: { organizationId: store.organizationId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalCents: true,
        currencyCode: true,
        workflowState: true,
        trackingToken: true,
        _count: { select: { lines: true } },
      },
    }),
  ])

  const { words, price, number, language } = storeText(theme)
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ')
  const trackingOrigin = env.AUTH_URL.replace(/\/$/, '')
  // Month names in the shop's language; the digits follow its numerals below.
  const dateFormat = new Intl.DateTimeFormat(
    language === 'bn' ? 'bn-BD' : 'en-GB',
    {
      numberingSystem: 'latn',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dhaka',
    }
  )

  return (
    <StoreDocument
      theme={theme}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      bottom={layout.bottom}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className={cn(
                'text-3xl font-semibold tracking-tight',
                headingFont
              )}
            >
              {name
                ? words.hello(customer.firstName ?? name)
                : words.yourAccount}
            </h1>
            <p className={cn('mt-1 text-sm', muted)}>
              {[customer.email, customer.phone].filter(Boolean).join(' · ')}
            </p>
          </div>
          <LogoutButton />
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{words.yourOrders}</h2>
          {orders.length === 0 ? (
            <div
              className={cn(
                panel,
                'flex flex-col items-center gap-4 px-6 py-14 text-center'
              )}
            >
              <Package className="size-9 opacity-50" />
              <p className={muted}>{words.noOrdersYet}</p>
              {/* A storefront path on the tenant's own host, not a dashboard route —
                a full page load is what crosses the store's rewrite. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/products" className={primaryButton}>
                {words.startShopping}
              </a>
            </div>
          ) : (
            <ul className={cn('divide-y rounded-xl border', hairline)}>
              {orders.map((order) => {
                const status =
                  CUSTOMER_ORDER_STATUS[order.workflowState] ??
                  CUSTOMER_ORDER_STATUS.PENDING!
                return (
                  <li
                    key={order.id}
                    className={cn(
                      'flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4',
                      hairline
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{order.orderNumber}</p>
                      <p className={cn('text-sm', muted)}>
                        {number(dateFormat.format(order.createdAt))} ·{' '}
                        {words.itemCount(order._count.lines)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        STATUS_TONE_CLASS[status.tone]
                      )}
                    >
                      {words.orderStatus[order.workflowState] ??
                        words.orderStatus.PENDING}
                    </span>
                    <span className="w-24 text-right font-semibold">
                      {price(order.totalCents, order.currencyCode)}
                    </span>
                    {order.trackingToken && (
                      // The tracking page lives on NCOM's own address, the
                      // same one the dispatch email links to.
                      <a
                        href={`${trackingOrigin}/track/${order.trackingToken}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {words.track}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </StoreDocument>
  )
}
