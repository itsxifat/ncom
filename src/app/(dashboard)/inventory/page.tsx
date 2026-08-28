import Link from 'next/link'
import { Boxes } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  getInventorySummary,
  listInventory,
  type InventorySort,
  type InventoryStockFilter,
} from '@/server/services/inventoryService'
import { listLocations } from '@/server/services/shippingService'
import { EmptyState } from '@/components/app/empty-state'
import { StatCard } from '@/components/app/stat-card'
import { InventoryFilters } from '@/components/store/inventory-filters'
import { InventoryTable } from '@/components/store/inventory-table'
import { Button } from '@/components/ui/button'

/** Rows per page. Enough to scan, few enough to keep the aggregate query cheap. */
const PAGE_SIZE = 50

const STOCK_FILTERS: InventoryStockFilter[] = ['all', 'low', 'out', 'in']
const SORTS: InventorySort[] = [
  'product',
  'available-asc',
  'available-desc',
  'updated',
]

export default async function InventoryPage({
  searchParams,
}: PageProps<'/inventory'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const stock = pick(query.stock, STOCK_FILTERS, 'all')
  const sort = pick(query.sort, SORTS, 'product')
  const locationId = typeof query.location === 'string' ? query.location : ''
  const page = Math.max(1, Number(query.page) || 1)

  const { organization } = await getActiveOrganization()
  const [{ items, total }, locations, summary] = await Promise.all([
    listInventory(organization.id, {
      search,
      stock,
      sort,
      locationId: locationId || undefined,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    listLocations(organization.id),
    getInventorySummary(organization.id),
  ])

  const filtered = Boolean(search) || stock !== 'all' || Boolean(locationId)

  if (summary.tracked === 0 && !filtered) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nothing tracked yet"
        description="Variants with inventory tracking switched on appear here so you can receive, count and adjust stock."
      />
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tracked variants" value={summary.tracked} />
        <StatCard
          label={`Low stock (≤ ${DEFAULT_LOW_STOCK_THRESHOLD})`}
          value={summary.low}
        />
        <StatCard label="Out of stock" value={summary.out} />
        <StatCard label="Committed to orders" value={summary.committed} />
      </div>

      <InventoryFilters
        search={search ?? ''}
        stock={stock}
        sort={sort}
        locationId={locationId}
        locations={locations.map((location) => ({
          id: location.id,
          name: location.name,
        }))}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nothing matches"
          description="No tracked variant matches these filters. Try clearing the search or switching the stock filter back to all."
        />
      ) : (
        <>
          <InventoryTable
            rows={items}
            locations={locations.map((location) => ({
              id: location.id,
              name: location.name,
            }))}
            lowStockThreshold={DEFAULT_LOW_STOCK_THRESHOLD}
          />

          {/* The count reflects everything the filters match, not just what is
              on screen — the old page reported the page size as the total, so a
              catalogue of 900 variants read as "50 tracked variants". */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {(page - 1) * PAGE_SIZE + items.length} of {total}
            </p>

            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  nativeButton={false}
                  render={
                    <Link
                      href={pageHref(query, page - 1)}
                      aria-disabled={page <= 1}
                    />
                  }
                >
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  nativeButton={false}
                  render={
                    <Link
                      href={pageHref(query, page + 1)}
                      aria-disabled={page >= pageCount}
                    />
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Keeps the active filters when paging, so page 2 is the same query. */
function pageHref(
  query: Record<string, string | string[] | undefined>,
  page: number
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === 'page') continue
    if (typeof value === 'string' && value !== '') params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))

  const search = params.toString()
  return search ? `/inventory?${search}` : '/inventory'
}

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: T[],
  fallback: T
): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback
}
