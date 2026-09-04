import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db/client'
import { catalogFetch } from './client'
import {
  parseCategories,
  parseProduct,
  parseProductPage,
  parseReserve,
  parseStock,
  parseVariants,
} from './contract'
import { loadConnection, requireConnection } from './connection'
import { CatalogUnsupportedError, isCatalogError } from './errors'
import type {
  ProductPage,
  ProductQuery,
  RemoteCategory,
  RemoteProduct,
  RemoteVariant,
  ReserveResult,
  StockMovementLine,
  StockState,
} from './types'

/**
 * The catalogue, read from the merchant's website.
 *
 * Every service that used to query Product, ProductVariant or InventoryLevel
 * calls one of these instead. They return the same *shapes* the old queries
 * returned, which is why the rewiring downstream is small — what changed is
 * where the data comes from, not what the storefront does with it.
 *
 * Two habits are worth keeping when adding to this file.
 *
 * **Resolve products, not variants.** A saved reference is always (product,
 * variant): offers store both, cart lines store both, order lines record both.
 * That is deliberate — it means everything can be answered by asking for
 * products by id, and a merchant only has to implement one endpoint properly.
 * `/variants` and `/stock` exist as faster paths, and both fall back to
 * products-by-id when a site does not implement them.
 *
 * **Ask once per render.** The reads are memoised per request with React's
 * `cache`, keyed on a stable string. That is deduplication, not caching:
 * two sections of one page asking for the same product make one call, and the
 * memo is gone when the response is sent. Nothing survives to the next request.
 */

/** How many ids to put in one products-by-id call. */
const ID_BATCH = 50

/** The default page size for a catalogue browse. */
const DEFAULT_LIMIT = 24

export interface VariantRef {
  variantId: string
  /** The product it belongs to. Always saved alongside the variant id. */
  productId?: string | null
}

export interface ResolvedVariant {
  variant: RemoteVariant
  product: RemoteProduct
}

/** The currency prices are quoted in, needed to read decimal amounts. */
const currencyFor = cache(async (organizationId: string): Promise<string> => {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencyCode: true },
  })
  return settings?.currencyCode ?? 'BDT'
})

/** Whether this workspace reads its catalogue from anywhere at all. */
export async function hasCatalogSource(
  organizationId: string
): Promise<boolean> {
  const connection = await loadConnection(organizationId)
  return connection !== null && connection.isActive
}

// ── Browsing ─────────────────────────────────────────────────────────────

export async function listProducts(
  organizationId: string,
  query: ProductQuery = {}
): Promise<ProductPage> {
  const [connection, currencyCode] = await Promise.all([
    requireConnection(organizationId),
    currencyFor(organizationId),
  ])

  const payload = await catalogFetch(connection, {
    method: 'GET',
    path: '/products',
    capability: 'products',
    query: {
      limit: query.limit ?? DEFAULT_LIMIT,
      cursor: query.cursor ?? undefined,
      q: query.q ?? undefined,
      category: query.categoryId ?? undefined,
      ids: query.ids && query.ids.length > 0 ? query.ids.join(',') : undefined,
      status: query.includeDrafts ? 'any' : 'active',
    },
  })

  const page = parseProductPage(payload, currencyCode)

  // A site that ignores `status` sends drafts to a storefront that must not
  // show them. Filtering here rather than trusting the query is the same rule
  // the local catalogue had: publication status is the merchant's statement
  // that something is not ready to be seen.
  if (!query.includeDrafts) {
    return {
      ...page,
      products: page.products.filter((product) => product.status === 'ACTIVE'),
    }
  }
  return page
}

/**
 * Search, with a fallback for sites that cannot.
 *
 * A connector that does not implement `search` still gets a usable product
 * picker: the first page is fetched and filtered here. That is a worse search
 * over a smaller set, and it is much better than a dashboard that cannot find
 * anything on a site whose developer skipped one query parameter.
 */
export async function searchProducts(
  organizationId: string,
  term: string,
  options: { limit?: number; includeDrafts?: boolean } = {}
): Promise<RemoteProduct[]> {
  const connection = await requireConnection(organizationId)
  const limit = options.limit ?? DEFAULT_LIMIT
  const needle = term.trim().toLowerCase()

  if (connection.capabilities.search && needle) {
    const page = await listProducts(organizationId, {
      q: needle,
      limit,
      includeDrafts: options.includeDrafts,
    })
    return page.products
  }

  const page = await listProducts(organizationId, {
    limit: Math.max(limit, 100),
    includeDrafts: options.includeDrafts,
  })
  if (!needle) return page.products.slice(0, limit)

  return page.products
    .filter((product) => {
      const haystack = [
        product.title,
        product.handle,
        product.vendor ?? '',
        ...product.variants.map((variant) => variant.sku ?? ''),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
    .slice(0, limit)
}

export const getProduct = cache(
  async (
    organizationId: string,
    idOrHandle: string
  ): Promise<RemoteProduct | null> => {
    const [connection, currencyCode] = await Promise.all([
      requireConnection(organizationId),
      currencyFor(organizationId),
    ])

    const payload = await catalogFetch(connection, {
      method: 'GET',
      path: `/products/${encodeURIComponent(idOrHandle)}`,
      capability: 'products',
      allowNotFound: true,
    })
    if (payload === null) return null

    return parseProduct(payload, currencyCode)
  }
)

/**
 * Products by id, in one call per fifty.
 *
 * The memo key is the sorted id list, so two sections asking for overlapping
 * sets in different orders still share a call.
 */
const productsByKey = cache(
  async (organizationId: string, key: string): Promise<RemoteProduct[]> => {
    const ids = key.split(',').filter(Boolean)
    if (ids.length === 0) return []

    const batches: string[][] = []
    for (let index = 0; index < ids.length; index += ID_BATCH) {
      batches.push(ids.slice(index, index + ID_BATCH))
    }

    const pages = await Promise.all(
      batches.map((batch) =>
        listProducts(organizationId, {
          ids: batch,
          limit: batch.length,
          includeDrafts: true,
        })
      )
    )

    return pages.flatMap((page) => page.products)
  }
)

export async function getProductsByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, RemoteProduct>> {
  const unique = [...new Set(ids.filter(Boolean))].sort()
  if (unique.length === 0) return new Map()

  const products = await productsByKey(organizationId, unique.join(','))
  const found = new Map(products.map((product) => [product.id, product]))

  // A site that ignores `ids` and returns its first page instead would silently
  // give the wrong products; asking for what is still missing one at a time
  // both fixes that and covers a connector whose list endpoint cannot filter.
  const missing = unique.filter((id) => !found.has(id))
  if (missing.length > 0 && missing.length <= ID_BATCH) {
    const singles = await Promise.all(
      missing.map((id) =>
        getProduct(organizationId, id).catch((error: unknown) => {
          if (isCatalogError(error) && error.failure === 'contract') return null
          throw error
        })
      )
    )
    for (const product of singles) {
      if (product) found.set(product.id, product)
    }
  }

  return found
}

// ── Variants ─────────────────────────────────────────────────────────────

/**
 * Resolves saved (product, variant) references to what they are right now.
 *
 * This is the function the storefront actually runs on. Offers, carts and the
 * checkout all hold references that were saved days ago against a catalogue
 * that has changed since — a price rise, a renamed size, a deleted product —
 * and every one of them has to be re-read before it can be shown or sold. A
 * reference that no longer resolves is simply absent from the result, and each
 * caller decides what that means: the page hides the option, the checkout
 * refuses the line.
 */
export async function resolveVariants(
  organizationId: string,
  refs: VariantRef[]
): Promise<Map<string, ResolvedVariant>> {
  const resolved = new Map<string, ResolvedVariant>()
  if (refs.length === 0) return resolved

  const productIds = [
    ...new Set(
      refs
        .map((ref) => ref.productId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]

  const products = await getProductsByIds(organizationId, productIds)
  const wanted = new Set(refs.map((ref) => ref.variantId))

  for (const product of products.values()) {
    for (const variant of product.variants) {
      if (wanted.has(variant.id)) resolved.set(variant.id, { variant, product })
    }
  }

  // References saved without a product id — or whose product moved — go through
  // the optional /variants endpoint, if the site has one.
  const orphans = refs
    .map((ref) => ref.variantId)
    .filter((id) => !resolved.has(id))

  if (orphans.length === 0) return resolved

  const variants = await fetchVariants(organizationId, orphans)
  for (const variant of variants) {
    const product = products.get(variant.productId)
    resolved.set(variant.id, {
      variant,
      product: product ?? syntheticProduct(variant),
    })
  }

  return resolved
}

async function fetchVariants(
  organizationId: string,
  ids: string[]
): Promise<RemoteVariant[]> {
  const [connection, currencyCode] = await Promise.all([
    requireConnection(organizationId),
    currencyFor(organizationId),
  ])

  try {
    const payload = await catalogFetch(connection, {
      method: 'POST',
      path: '/variants',
      body: { ids },
    })
    return parseVariants(payload, currencyCode)
  } catch (error) {
    // Optional endpoint, and tried rather than gated on a capability flag: a
    // connection that has never been health-checked has no flags, and refusing
    // to try would turn "we have not asked yet" into "your site cannot do it".
    //
    // A site without it simply cannot answer for a variant whose product we do
    // not know — which since this release only happens to references saved by
    // an older version.
    if (
      isCatalogError(error) &&
      (error.failure === 'contract' || error.failure === 'unsupported')
    ) {
      return []
    }
    throw error
  }
}

/**
 * A stand-in product for a variant that arrived without one.
 *
 * Never shown as a product page — it exists so a cart line resolved through
 * /variants still has a title and an image to render.
 */
function syntheticProduct(variant: RemoteVariant): RemoteProduct {
  return {
    id: variant.productId || variant.id,
    handle: variant.productId || variant.id,
    title: variant.title,
    description: null,
    status: 'ACTIVE',
    vendor: null,
    productType: null,
    tags: [],
    categoryId: null,
    groupIds: [],
    images: variant.imageUrl ? [{ url: variant.imageUrl, alt: null }] : [],
    options: [],
    variants: [variant],
    url: null,
  }
}

// ── Stock ────────────────────────────────────────────────────────────────

/**
 * What can be sold right now, for a set of variants.
 *
 * Prefers the dedicated `/stock` endpoint because it is the one call a merchant
 * can make fast — it is asked on every cart render and again inside every
 * checkout — and falls back to reading the products when a site does not
 * implement it. Both answer the same question; one is cheaper.
 */
export async function getStock(
  organizationId: string,
  refs: VariantRef[]
): Promise<Map<string, StockState>> {
  const stock = new Map<string, StockState>()
  if (refs.length === 0) return stock

  const connection = await requireConnection(organizationId)
  const ids = [...new Set(refs.map((ref) => ref.variantId))]

  if (connection.capabilities.stock) {
    try {
      const payload = await catalogFetch(connection, {
        method: 'POST',
        path: '/stock',
        body: { ids },
      })
      for (const [id, row] of parseStock(payload)) {
        stock.set(id, row)
      }
    } catch (error) {
      if (!isCatalogError(error) || error.failure !== 'contract') throw error
    }
  }

  const missing = refs.filter((ref) => !stock.has(ref.variantId))
  if (missing.length === 0) return stock

  const resolved = await resolveVariants(organizationId, missing)
  for (const [id, entry] of resolved) {
    stock.set(id, {
      available: entry.variant.available,
      policy: entry.variant.policy,
    })
  }

  return stock
}

/** The rule for "can this be sold", in the one place everything asks it. */
export function isSellable(state: StockState, quantity = 1): boolean {
  if (state.available === null) return true
  if (state.policy === 'CONTINUE') return true
  return state.available >= quantity
}

// ── Categories ───────────────────────────────────────────────────────────

export async function listCategories(
  organizationId: string
): Promise<RemoteCategory[]> {
  const connection = await requireConnection(organizationId)
  if (!connection.capabilities.categories) return []

  const payload = await catalogFetch(connection, {
    method: 'GET',
    path: '/categories',
    capability: 'categories',
  })
  return parseCategories(payload)
}

// ── Stock movements ──────────────────────────────────────────────────────

/**
 * Asks the merchant's system to hold stock for an order.
 *
 * NCOM does not own these numbers and cannot decrement them; the most it can do
 * is ask, and report honestly when the answer is no. A site that implements
 * `/reserve` gets the guarantee the local inventory table used to give — the
 * order is refused if the units are not there. A site that does not gets a
 * best-effort check moments earlier and, if two shoppers race for the last
 * unit, an oversell the merchant resolves the way they did before they had us.
 *
 * That difference is the single most important line in the connector docs, and
 * the dashboard says which mode a workspace is in.
 */
export async function reserveStock(
  organizationId: string,
  orderRef: string,
  lines: StockMovementLine[]
): Promise<ReserveResult> {
  if (lines.length === 0) return { ok: true, rejected: [] }

  const connection = await requireConnection(organizationId)
  if (!connection.capabilities.reserve) {
    throw new CatalogUnsupportedError('reserve')
  }

  const payload = await catalogFetch(connection, {
    method: 'POST',
    path: '/reserve',
    capability: 'reserve',
    body: { orderRef, lines },
  })

  return parseReserve(payload)
}

/**
 * Hands a reservation back — a cancelled order, a failed checkout, a return.
 *
 * Failure is swallowed by callers on purpose: the order is already cancelled in
 * NCOM, and throwing here would leave a merchant looking at a cancellation that
 * did not save. The mismatch is real and is logged; a stuck reservation is a
 * stock count to correct, not a transaction to roll back.
 */
export async function releaseStock(
  organizationId: string,
  orderRef: string,
  lines: StockMovementLine[]
): Promise<void> {
  if (lines.length === 0) return

  const connection = await requireConnection(organizationId)
  if (!connection.capabilities.release) {
    throw new CatalogUnsupportedError('release')
  }

  await catalogFetch(connection, {
    method: 'POST',
    path: '/release',
    capability: 'release',
    body: { orderRef, lines },
  })
}

export async function canReserve(organizationId: string): Promise<boolean> {
  const connection = await loadConnection(organizationId)
  return connection?.capabilities.reserve === true
}
