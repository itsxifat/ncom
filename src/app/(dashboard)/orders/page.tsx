import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listOrders } from '@/server/services/orderService'
import { getOrderStatusColors } from '@/server/services/organizationSettingsService'
import { listStores } from '@/server/services/storeService'
import { EmptyState } from '@/components/app/empty-state'
import { OrderList } from '@/components/store/order-list'
import { OrderFilters } from '@/components/store/order-filters'
import { orderStatus } from '@/lib/order-status'
import { Button } from '@/components/ui/button'
import type {
  FinancialStatus,
  OrderWorkflowState,
} from '@/generated/prisma/enums'

const PAGE_SIZE = 50

const FINANCIAL_VALUES = [
  'PENDING',
  'AUTHORIZED',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'VOIDED',
] as const satisfies readonly FinancialStatus[]

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
] as const satisfies readonly OrderWorkflowState[]

/**
 * Reads the `delivery` parameter, which carries either one state or several.
 *
 * The saved views in the filter bar are questions like "what still needs doing"
 * that no single status answers, so the parameter is a comma-separated list.
 * Unknown values are dropped rather than rejected — a stale bookmark from
 * before a state was renamed should narrow the list oddly, not fail to render
 * it.
 */
function parseWorkflowStates(raw: unknown): OrderWorkflowState[] {
  if (typeof raw !== 'string' || raw === '') return []

  const wanted = new Set(raw.split(','))
  return WORKFLOW_VALUES.filter((value) => wanted.has(value))
}

export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const financialStatus = FINANCIAL_VALUES.find(
    (value) => value === query.financial
  )
  const workflowStates = parseWorkflowStates(query.delivery)
  const page = Math.max(1, Number(query.page) || 1)

  const { organization, role } = await getActiveOrganization()

  const [stores, statusColors] = await Promise.all([
    listStores(organization.id),
    getOrderStatusColors(organization.id),
  ])

  // A store id from the query string is only honoured if it is one of this
  // workspace's own — `listOrders` scopes by organisation regardless, but a
  // filter that silently matched nothing would read as "no orders today".
  const storeId = stores.find((store) => store.id === query.store)?.id

  const { items, total } = await listOrders(organization.id, {
    search,
    financialStatus,
    // Only ever one of the two is passed: `listOrders` spreads them into the
    // same `workflowState` key, so sending both would silently drop one.
    ...(workflowStates.length === 1
      ? { workflowState: workflowStates[0] }
      : workflowStates.length > 1
        ? { workflowStateIn: workflowStates }
        : {}),
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
      ...(workflowStates.length ? { delivery: workflowStates.join(',') } : {}),
      ...(storeId ? { store: storeId } : {}),
      page: String(next),
    }).toString()

  const filtered = Boolean(
    search || financialStatus || workflowStates.length || storeId
  )

  // Nothing at all, and nothing filtered out — this workspace has simply not
  // sold anything yet, which is a different screen from "no matches".
  if (total === 0 && !filtered) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No orders yet"
        description="Orders placed on your storefront will appear here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <OrderFilters
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
        total={total}
      />

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
          statusColors={statusColors}
          // VIEWERs read the order book; moving a parcel along is an EDITOR's
          // job, and the server enforces the same line. Rendering the menu for
          // someone who cannot use it is offering a button that fails.
          canEditStatus={role !== 'VIEWER'}
          orders={items.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            customerName:
              [order.customer?.firstName, order.customer?.lastName]
                .filter(Boolean)
                .join(' ') ||
              order.email ||
              order.phone ||
              'Guest',
            itemCount: order.lines.reduce(
              (sum, line) => sum + line.quantity,
              0
            ),
            placedOn: order.createdAt.toLocaleDateString(),
            financialStatus: order.financialStatus,
            // The merged status — see lib/order-status.ts. Read straight off
            // `workflowState`, a cancelled order used to sit in this list under
            // whatever the pipeline last said, usually "Pending".
            workflowState: orderStatus(order),
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
