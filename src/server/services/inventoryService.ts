import 'server-only'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  getStock,
  isSellable,
  listProducts,
  releaseStock,
  reserveStock,
  canReserve,
  isCatalogError,
  type RemoteProduct,
  type VariantRef,
} from '@/server/catalog'

/**
 * Stock, which NCOM does not own.
 *
 * This module used to be the authority: two integers per (location, variant),
 * moved by a conditional decrement inside the checkout transaction, with an
 * append-only ledger beside them. All of that is gone. The merchant's own
 * website holds the numbers, and this file does three things instead:
 *
 *   - reads them, live, for whoever is asking;
 *   - asks the merchant's system to hold units for an order, and to hand them
 *     back when one is cancelled;
 *   - answers "can we even do that here", because a site that has not
 *     implemented a reservation endpoint cannot hold anything.
 *
 * What was lost with the local table is the atomic decrement. When two shoppers
 * race for the last unit, the winner is now decided by the merchant's site if
 * it implements `/reserve`, and by nobody if it does not — in which case both
 * orders are taken and the merchant sorts it out, exactly as they did before
 * they had NCOM. That is the trade the live-catalogue design makes, it is
 * written down in docs/product-source.md, and the dashboard says which of the
 * two modes a workspace is in rather than letting anyone assume the stronger
 * one.
 *
 * What was gained: there is no second copy of a stock figure anywhere in this
 * system, so there is nothing to drift, nothing to re-sync, and no window in
 * which a storefront sells from a number the merchant corrected an hour ago.
 */

export const DEFAULT_LOW_STOCK_THRESHOLD = 5

export type InventoryStockFilter = 'all' | 'low' | 'out' | 'in'
export type InventorySort = 'product' | 'available-asc' | 'available-desc'

export interface InventoryRow {
  /** The merchant's own variant id. */
  id: string
  title: string
  sku: string | null
  barcode: string | null
  policy: 'DENY' | 'CONTINUE'
  productId: string
  productTitle: string
  imageUrl: string | null
  /** Null means the merchant does not count this line. */
  available: number | null
}

/** Availability for a set of references, straight from the merchant's site. */
export async function getAvailability(
  organizationId: string,
  refs: VariantRef[]
): Promise<Map<string, number | null>> {
  const stock = await getStock(organizationId, refs)
  return new Map([...stock].map(([id, state]) => [id, state.available]))
}

// ── Order movements ──────────────────────────────────────────────────────

export interface StockLine {
  variantId: string
  quantity: number
}

/**
 * Asks the merchant's system to hold units for an order.
 *
 * Returns whether anything is actually being held, so a caller can tell the
 * difference between "reserved" and "there is nothing here that reserves".
 * Throws when the site refuses — the units are not there, and the order that
 * would have taken them must not be written.
 */
export async function holdForOrder(
  organizationId: string,
  orderRef: string,
  lines: StockLine[]
): Promise<boolean> {
  if (lines.length === 0) return false
  if (!(await canReserve(organizationId))) return false

  const result = await reserveStock(organizationId, orderRef, lines)
  if (result.ok) return true

  const first = result.rejected[0]
  throw new Error(first?.reason ?? 'Some items are no longer in stock')
}

/**
 * Hands units back: a cancellation, a return, a checkout that failed after the
 * hold.
 *
 * Never throws. The order state that prompted this has already changed in
 * NCOM, and failing here would leave a merchant looking at a cancellation that
 * did not save. A stuck reservation is a number to correct on their side; it is
 * logged, and it is not a reason to refuse the cancellation.
 */
export async function returnToStock(
  organizationId: string,
  orderRef: string,
  lines: StockLine[]
): Promise<void> {
  if (lines.length === 0) return

  try {
    await releaseStock(organizationId, orderRef, lines)
  } catch (error) {
    if (isCatalogError(error) && error.failure === 'unsupported') return
    console.error('[inventory] could not return stock', orderRef, error)
  }
}

// ── The admin table ──────────────────────────────────────────────────────

/**
 * How much of a catalogue the stock screen will page through.
 *
 * The old table filtered and sorted in SQL over the whole catalogue. A remote
 * catalogue cannot be sorted by a column we do not have, so "lowest stock
 * first" means reading pages until there is enough to sort — and reading a
 * merchant's entire catalogue on every page view is not a thing to do to their
 * server. The ceiling is high enough for the shops this platform sells to and
 * low enough to stay polite, and the screen says plainly when it has been hit
 * rather than quietly reporting a total that is not one.
 */
const MAX_SCAN_PRODUCTS = 1000
const SCAN_PAGE_SIZE = 100

export async function listInventory(
  organizationId: string,
  options: {
    search?: string
    stock?: InventoryStockFilter
    sort?: InventorySort
    lowStockThreshold?: number
    take?: number
    skip?: number
  } = {}
): Promise<{ items: InventoryRow[]; total: number; truncated: boolean }> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const take = Math.min(Math.max(options.take ?? 50, 1), 250)
  const skip = Math.max(options.skip ?? 0, 0)
  const threshold = options.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD
  const search = options.search?.trim().toLowerCase()

  const { products, truncated } = await scanCatalogue(organizationId)

  let rows = products.flatMap((product) =>
    product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      barcode: variant.barcode,
      policy: variant.policy,
      productId: product.id,
      productTitle: product.title,
      imageUrl: variant.imageUrl ?? product.images[0]?.url ?? null,
      available: variant.available,
    }))
  )

  if (search) {
    // Matches product title, variant title, SKU and barcode. SKU especially:
    // it is what is printed on the box someone is holding while they search.
    rows = rows.filter((row) =>
      [row.productTitle, row.title, row.sku ?? '', row.barcode ?? '']
        .join(' ')
        .toLowerCase()
        .includes(search)
    )
  }

  const stockFilter = options.stock ?? 'all'
  if (stockFilter !== 'all') {
    rows = rows.filter((row) => {
      // An untracked line has no count to be low or out, and listing it as
      // "0 in stock" beside real counts would be actively misleading.
      if (row.available === null) return stockFilter === 'in'
      if (stockFilter === 'out') return row.available <= 0
      if (stockFilter === 'low')
        return row.available > 0 && row.available <= threshold
      return row.available > 0
    })
  }

  const sort = options.sort ?? 'product'
  rows.sort((a, b) => {
    if (sort === 'available-asc' || sort === 'available-desc') {
      // Untracked lines sort last either way: they are not a stock number, and
      // putting "unlimited" at the top of "lowest first" buries the shortage
      // the merchant opened this screen to find.
      if (a.available === null || b.available === null) {
        return (a.available === null ? 1 : 0) - (b.available === null ? 1 : 0)
      }
      return sort === 'available-asc'
        ? a.available - b.available
        : b.available - a.available
    }
    return (
      a.productTitle.localeCompare(b.productTitle) ||
      a.title.localeCompare(b.title)
    )
  })

  return {
    items: rows.slice(skip, skip + take),
    total: rows.length,
    truncated,
  }
}

export async function getInventorySummary(organizationId: string): Promise<{
  tracked: number
  low: number
  out: number
  truncated: boolean
}> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const { products, truncated } = await scanCatalogue(organizationId)

  let tracked = 0
  let low = 0
  let out = 0

  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.available === null) continue
      tracked += 1
      if (variant.available <= 0) out += 1
      else if (variant.available <= DEFAULT_LOW_STOCK_THRESHOLD) low += 1
    }
  }

  return { tracked, low, out, truncated }
}

/** Whether a variant can be sold right now, for one-off checks. */
export async function isVariantSellable(
  organizationId: string,
  ref: VariantRef,
  quantity = 1
): Promise<boolean> {
  const stock = await getStock(organizationId, [ref])
  const state = stock.get(ref.variantId)
  return state ? isSellable(state, quantity) : false
}

/**
 * Pages through the connected catalogue, once per request.
 *
 * Deliberately not memoised beyond the request: two admins looking at the stock
 * screen are two reads of the merchant's site, and that is the arrangement.
 */
async function scanCatalogue(
  organizationId: string
): Promise<{ products: RemoteProduct[]; truncated: boolean }> {
  const products: RemoteProduct[] = []
  let cursor: string | null = null

  while (products.length < MAX_SCAN_PRODUCTS) {
    const page = await listProducts(organizationId, {
      limit: SCAN_PAGE_SIZE,
      cursor,
      includeDrafts: true,
    })

    products.push(...page.products)

    if (!page.nextCursor || page.products.length === 0) {
      return { products, truncated: false }
    }
    cursor = page.nextCursor
  }

  return { products, truncated: true }
}
