import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listOrders } from '@/server/services/orderService'
import { formatMoney } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FinancialStatusBadge,
  FulfillmentStatusBadge,
} from '@/components/store/status-badges'
import { Money } from '@/components/store/form-controls'
import { FormSelect } from '@/components/ui/form-select'

const PAGE_SIZE = 50

const FINANCIAL_VALUES = [
  'PENDING',
  'AUTHORIZED',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'VOIDED',
] as const

const FULFILLMENT_VALUES = [
  'UNFULFILLED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'RESTOCKED',
] as const

export default async function OrdersPage({
  params,
  searchParams,
}: PageProps<'/orders'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const financialStatus = FINANCIAL_VALUES.find(
    (value) => value === query.financial
  )
  const fulfillmentStatus = FULFILLMENT_VALUES.find(
    (value) => value === query.fulfillment
  )
  const page = Math.max(1, Number(query.page) || 1)

  const { organization } = await getActiveOrganization()
  const { items, total } = await listOrders(organization.id, {
    search,
    financialStatus,
    fulfillmentStatus,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  })

  const base = `/orders`

  if (total === 0 && !search && !financialStatus && !fulfillmentStatus) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No orders yet"
        description="Orders placed on your storefront will appear here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-center gap-3">
        <Input
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search order number or email"
          className="w-full sm:w-72"
        />
        <FormSelect name="financial" defaultValue={financialStatus ?? ''}>
          <option value="">Any payment status</option>
          {FINANCIAL_VALUES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </FormSelect>
        <FormSelect name="fulfillment" defaultValue={fulfillmentStatus ?? ''}>
          <option value="">Any fulfilment status</option>
          {FULFILLMENT_VALUES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </FormSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders match"
          description="Try clearing the filters."
        />
      ) : (
        <ListPanel>
          <ListPanelHeader>
            <p className="text-muted-foreground text-sm">
              {total} {total === 1 ? 'order' : 'orders'}
            </p>
          </ListPanelHeader>

          {items.map((order) => {
            const itemCount = order.lines.reduce(
              (sum, line) => sum + line.quantity,
              0
            )
            const customerName = [
              order.customer?.firstName,
              order.customer?.lastName,
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <ListRow key={order.id}>
                <ListRowText
                  title={
                    <Link
                      href={`${base}/${order.id}`}
                      className="hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  }
                  meta={
                    <>
                      {customerName || order.email} · {itemCount}{' '}
                      {itemCount === 1 ? 'item' : 'items'} ·{' '}
                      {order.createdAt.toLocaleDateString()}
                    </>
                  }
                  badges={
                    <>
                      <FinancialStatusBadge status={order.financialStatus} />
                      <FulfillmentStatusBadge
                        status={order.fulfillmentStatus}
                      />
                      {/* Which storefront sold it. One catalogue can be sold
                          from several landing pages, so this is how a merchant
                          tells which page is actually working. */}
                      {order.store && (
                        <Badge variant="outline">{order.store.name}</Badge>
                      )}
                      {order.page && (
                        <Badge variant="outline">{order.page.title}</Badge>
                      )}
                      {order.offerLabel && (
                        <Badge variant="secondary">{order.offerLabel}</Badge>
                      )}
                    </>
                  }
                />
                <ListRowActions>
                  <Money>
                    {formatMoney(order.totalCents, order.currencyCode)}
                  </Money>
                </ListRowActions>
              </ListRow>
            )
          })}
        </ListPanel>
      )}

      {total > PAGE_SIZE && (
        <nav className="flex justify-between">
          {page > 1 ? (
            <Button
              variant="outline"
              render={<Link href={`${base}?page=${page - 1}`} />}
              nativeButton={false}
            >
              Previous
            </Button>
          ) : (
            <span />
          )}
          {page * PAGE_SIZE < total && (
            <Button
              variant="outline"
              render={<Link href={`${base}?page=${page + 1}`} />}
              nativeButton={false}
            >
              Next
            </Button>
          )}
        </nav>
      )}
    </div>
  )
}
