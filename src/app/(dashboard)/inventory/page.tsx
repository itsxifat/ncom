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
import { describeFailure } from '@/server/catalog'
import { EmptyState } from '@/components/app/empty-state'
import { StatCard } from '@/components/app/stat-card'
import { InventoryFilters } from '@/components/store/inventory-filters'
import { InventoryTable } from '@/components/store/inventory-table'
import { Button } from '@/components/ui/button'

/** Rows per page. Enough to scan, few enough to keep the aggregate query cheap. */
const PAGE_SIZE = 50

const STOCK_FILTERS: InventoryStockFilter[] = ['all', 'low', 'out', 'in']
const SORTS: InventorySort[] = ['product', 'available-asc', 'available-desc']

export default async function InventoryPage({
  searchParams,
}: PageProps<'/inventory'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const stock = pick(query.stock, STOCK_FILTERS, 'all')
  const sort = pick(query.sort, SORTS, 'product')
  const page = Math.max(1, Number(query.page) || 1)

  const { organization } = await getActiveOrganization()

  // Read from the merchant's own website. A workspace with no product source
  // connected has no stock to show and is told what to do about it, rather than
  // being shown an empty table that looks like a shop with nothing in it.
  let items: Awaited<ReturnType<typeof listInventory>>['items'] = []
  let total = 0
  let truncated = false
  let summary = { tracked: 0, low: 0, out: 0, truncated: false }
  let failure: string | null = null

  try {
    const [listed, counted] = await Promise.all([
      listInventory(organization.id, {
        search,
        stock,
        sort,
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      getInventorySummary(organization.id),
    ])
    items = listed.items
    total = listed.total
    truncated = listed.truncated
    summary = counted
  } catch (error) {
    failure = describeFailure(error)
  }

  const filtered = Boolean(search) || stock !== 'all'

  if (failure) {
    return (
      <EmptyState
        icon={Boxes}
        title="Stock could not be read"
        description={`${failure} Stock lives on your own website — check Settings → Product source.`}
      />
    )
  }

  if (summary.tracked === 0 && !filtered) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nothing counted yet"
        description="Your website reports no stock counts. Products whose stock it does count appear here, read live — set the numbers on your own site and this follows."
      />
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Counted variants" value={summary.tracked} />
        <StatCard
          label={`Low stock (≤ ${DEFAULT_LOW_STOCK_THRESHOLD})`}
          value={summary.low}
        />
        <StatCard label="Out of stock" value={summary.out} />
      </div>

      <p className="text-muted-foreground text-sm">
        Read live from your website. Counts change there, not here.
      </p>

      <InventoryFilters search={search ?? ''} stock={stock} sort={sort} />

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
            lowStockThreshold={DEFAULT_LOW_STOCK_THRESHOLD}
          />

          {truncated && (
            <p className="text-muted-foreground text-sm">
              Showing the first {total} variants your website returned. Search
              to narrow this down — the whole catalogue is not read on every
              page view, because it is your server answering.
            </p>
          )}

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
