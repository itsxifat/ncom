import Link from 'next/link'
import { Printer } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listOrders } from '@/server/services/orderService'
import { listStores } from '@/server/services/storeService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { OrderList } from '@/components/store/order-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'
import type { OrderWorkflowState } from '@/generated/prisma/enums'

export const metadata = { title: 'Labels' }

const PAGE_SIZE = 100

/**
 * The views a print run is actually started from.
 *
 * A merchant at a printer is not thinking in workflow states, they are thinking
 * "the ones I have not sent yet" — which is four states, and picking them one
 * at a time from a status dropdown is how half a morning's parcels get missed.
 * `packing` is the default for that reason.
 */
const VIEWS = {
  packing: {
    label: 'Still to go out',
    states: [
      'PENDING',
      'PROCESSING',
      'DISPATCHED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'FAILED',
    ] as OrderWorkflowState[],
  },
  unsent: {
    label: 'Not handed to a courier yet',
    states: ['PENDING', 'PROCESSING'] as OrderWorkflowState[],
  },
  all: { label: 'Every order', states: [] as OrderWorkflowState[] },
} as const

type ViewKey = keyof typeof VIEWS

/**
 * Printing parcel stickers and invoices, in bulk.
 *
 * The same selection exists on the orders list, and this page is not a second
 * implementation of it — it is the orders list narrowed to the one job, because
 * "print the morning's labels" is a task someone does at a fixed time with a
 * printer switched on, and asking them to find it inside a screen built for
 * looking up single orders means they never find it at all.
 *
 * Tick what is going out, press the button. The tab that opens carries the
 * layout and the print dialog; this list keeps its selection so a second run —
 * the invoices to go inside the parcels — is one more click.
 */
export default async function LabelsPage({
  searchParams,
}: PageProps<'/labels'>) {
  const query = await searchParams
  const { organization } = await getActiveOrganization()

  const view: ViewKey =
    query.view === 'all' || query.view === 'unsent' ? query.view : 'packing'
  const search = typeof query.q === 'string' ? query.q.trim() : undefined
  const page = Math.max(1, Number(query.page) || 1)

  const stores = await listStores(organization.id)
  const storeId = stores.find((store) => store.id === query.store)?.id

  const { items, total } = await listOrders(organization.id, {
    search: search || undefined,
    storeId,
    workflowStateIn: VIEWS[view].states,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  })

  const pageQuery = (next: number) =>
    new URLSearchParams({
      view,
      ...(search ? { q: search } : {}),
      ...(storeId ? { store: storeId } : {}),
      page: String(next),
    }).toString()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Fulfilment"
        title="Labels"
        description="Tick the orders going out, then print 4×6 parcel stickers or A4 invoices. Every sticker carries a barcode the scanner reads."
      />

      <form className="flex flex-wrap items-center gap-3">
        <FormSelect name="view" defaultValue={view}>
          {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
            <option key={key} value={key}>
              {VIEWS[key].label}
            </option>
          ))}
        </FormSelect>

        {/* One workspace packs several sites' parcels, usually one pile at a
            time — so a print run starts by naming the pile. */}
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

        <Input
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search order number or email"
          className="w-full sm:w-64"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Printer}
          title="Nothing to print"
          description={
            view === 'all'
              ? 'No orders match this filter.'
              : 'No orders are waiting to go out. Switch to “Every order” to reprint something already delivered.'
          }
        />
      ) : (
        <OrderList base="/orders" total={total} orders={items.map(toRow)} />
      )}

      {total > PAGE_SIZE && (
        <nav className="flex justify-between">
          {page > 1 ? (
            <Button
              variant="outline"
              render={<Link href={`/labels?${pageQuery(page - 1)}`} />}
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
              render={<Link href={`/labels?${pageQuery(page + 1)}`} />}
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

type ListedOrder = Awaited<ReturnType<typeof listOrders>>['items'][number]

function toRow(order: ListedOrder) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName:
      [order.customer?.firstName, order.customer?.lastName]
        .filter(Boolean)
        .join(' ') ||
      order.email ||
      'Guest',
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    placedOn: order.createdAt.toLocaleDateString(),
    financialStatus: order.financialStatus,
    workflowState: order.workflowState,
    storeName: order.store?.name ?? null,
    pageTitle: order.page?.title ?? null,
    offerLabel: order.offerLabel,
    totalCents: order.totalCents,
    currencyCode: order.currencyCode,
  }
}
