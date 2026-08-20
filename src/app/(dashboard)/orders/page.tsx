import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listOrders } from '@/server/services/orderService'
import { listStores } from '@/server/services/storeService'
import { EmptyState } from '@/components/app/empty-state'
import { OrderList } from '@/components/store/order-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'

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

const WORKFLOW_VALUES = [
  'PENDING',
  'FRAUD_REVIEW',
  'PROCESSING',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'RETURNED',
  'CANCELLED',
  'FAILED',
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
  const workflowState = WORKFLOW_VALUES.find(
    (value) => value === query.delivery
  )
  const page = Math.max(1, Number(query.page) || 1)

  const { organization } = await getActiveOrganization()

  const stores = await listStores(organization.id)
  // A store id from the query string is only honoured if it is one of this
  // workspace's own — `listOrders` scopes by organisation regardless, but a
  // filter that silently matched nothing would read as "no orders today".
  const storeId = stores.find((store) => store.id === query.store)?.id

  const { items, total } = await listOrders(organization.id, {
    search,
    financialStatus,
    workflowState,
    storeId,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  })

  const base = `/orders`

  // Paging must not drop the filters. It did, so page two of "waiting for
  // review" was page two of everything, which reads as the queue having
  // silently refilled.
  const pageQuery = (next: number) =>
    new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(financialStatus ? { financial: financialStatus } : {}),
      ...(workflowState ? { delivery: workflowState } : {}),
      ...(storeId ? { store: storeId } : {}),
      page: String(next),
    }).toString()

  if (
    total === 0 &&
    !search &&
    !financialStatus &&
    !workflowState &&
    !storeId
  ) {
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
        {/* Which site sold it. A workspace runs several landing pages and
            packs them separately, so "today's parcels for this store" is the
            filter a print run starts from. */}
        {stores.length > 1 && (
          <FormSelect name="store" defaultValue={storeId ?? ''}>
            <option value="">Every store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </FormSelect>
        )}
        <FormSelect name="financial" defaultValue={financialStatus ?? ''}>
          <option value="">Any payment status</option>
          {FINANCIAL_VALUES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </FormSelect>
        <FormSelect name="delivery" defaultValue={workflowState ?? ''}>
          <option value="">Any delivery state</option>
          {WORKFLOW_VALUES.map((value) => (
            <option key={value} value={value}>
              {WORKFLOW_STATE_LABEL[value]}
            </option>
          ))}
        </FormSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {/* The review queue is the one filter a merchant needs every morning, so
          it gets a link rather than being buried in a dropdown. */}
      {!workflowState && (
        <Link
          href={`${base}?delivery=FRAUD_REVIEW`}
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          Show only orders waiting for review
        </Link>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders match"
          description="Try clearing the filters."
        />
      ) : (
        <OrderList
          base={base}
          total={total}
          orders={items.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            customerName:
              [order.customer?.firstName, order.customer?.lastName]
                .filter(Boolean)
                .join(' ') ||
              order.email ||
              'Guest',
            itemCount: order.lines.reduce(
              (sum, line) => sum + line.quantity,
              0
            ),
            placedOn: order.createdAt.toLocaleDateString(),
            financialStatus: order.financialStatus,
            workflowState: order.workflowState,
            storeName: order.store?.name ?? null,
            pageTitle: order.page?.title ?? null,
            offerLabel: order.offerLabel,
            totalCents: order.totalCents,
            currencyCode: order.currencyCode,
          }))}
        />
      )}

      {total > PAGE_SIZE && (
        <nav className="flex justify-between">
          {page > 1 ? (
            <Button
              variant="outline"
              render={<Link href={`${base}?${pageQuery(page - 1)}`} />}
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
              render={<Link href={`${base}?${pageQuery(page + 1)}`} />}
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
