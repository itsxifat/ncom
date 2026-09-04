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
import {
  getLocalProduct,
  getLocalProductsByIds,
  getLocalStock,
  getLocalVariantsByIds,
  listLocalCategories,
  listLocalProducts,
} from './local'
import { isSellable } from './rules'
import { CatalogUnsupportedError, isCatalogError } from './errors'
import type {
  ProductPage,
  ProductQuery,
  CatalogCategory,
  CatalogProduct,
  CatalogSource,
  CatalogVariant,
  ReserveResult,
  StockMovementLine,
  StockState,
} from './types'

/**
 * The catalogue: both of them, merged.
 *
 * A workspace sells from two places at once — products stored in NCOM (local.ts)
 * and products read live from the merchant's own website (client.ts). Every
 * service that used to query Product, ProductVariant or InventoryLevel calls
 * one of the functions here instead, and gets both kinds back in one list.
 *
 * **Local first, always.** Every merged read starts with one indexed query
 * against our own tables and asks the connector only for what did not come
 * back. That order is the routing rule rather than an optimisation: an id
 * either belongs to a product we keep or it does not, answering that locally is
 * cheap and certain, and it keeps working when the merchant's site is down.
 *
 * A workspace with no connection is therefore a perfectly good local-only shop,
 * and one with no local products is a perfectly good remote-only shop. Neither
 * is a mode anybody has to choose, and an offer may freely mix the two — which
 * is the point: a bundle of the merchant's own shirts plus a tote that only
 * exists for this campaign.
 *
 * Two habits are worth keeping when adding to this file.
 *
 * **Resolve products, not variants.** A saved reference is always (product,
 * variant): offers store both, cart lines store both, order lines record both.
 * That is deliberate — everything can then be answered by asking for products
 * by id, and a merchant only has to implement one connector endpoint properly.
 *
 * **Ask once per render.** Remote reads are memoised per request with React's
 * `cache`, keyed on a stable string. That is deduplication, not caching: two
 * sections of one page asking for the same product make one call, and the memo
 * dies with the response. Nothing about a remote product outlives the request.
 */

/** How many ids to put in one products-by-id call. */
const ID_BATCH = 50

/** The default page size for a catalogue browse. */
const DEFAULT_LIMIT = 24

/**
 * How many local products a merged page carries.
 *
 * Local products are the exceptions a merchant adds by hand — a gift, a bundle
 * item, something not on their shop yet — so the whole set fits on the first
 * page and stays there. A workspace that has typed three hundred products into
 * NCOM is using it as its catalogue, which is allowed, and paging past this
 * many falls through to search.
 */
const LOCAL_PAGE_LIMIT = 200

export interface VariantRef {
  variantId: string
  /** The product it belongs to. Always saved alongside the variant id. */
  productId?: string | null
}

export interface ResolvedVariant {
  variant: CatalogVariant
  product: CatalogProduct
  /**
   * Which catalogue answered.
   *
   * Two callers genuinely need this and the rest can ignore it: the dashboard,
   * which may only offer an edit form for a product we keep, and the stock
   * path, which decrements our own rows for a local line and asks the
   * merchant's website about a remote one.
   */
  source: CatalogSource
}

/** The currency prices are quoted in, needed to read decimal amounts. */
const currencyFor = cache(async (organizationId: string): Promise<string> => {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencyCode: true },
  })
  return settings?.currencyCode ?? 'BDT'
})

/** Whether this workspace has a website connected. */
export async function hasCatalogSource(
  organizationId: string
): Promise<boolean> {
  const connection = await loadConnection(organizationId)
  return connection !== null && connection.isActive
}

/**
 * Runs a remote read, or returns a fallback when there is nothing to read from.
 *
 * A workspace selling only its own products has no connector, and asking for
 * one throws `CatalogNotConfiguredError` — the right answer to "connect to the
 * website" and the wrong answer to "list the catalogue". Every merged read goes
 * through here so that a shop with no connection is simply empty on the remote
 * side rather than broken.
 *
 * A connector that *is* configured and then fails still throws. That is a real
 * failure a merchant has to see; quietly showing them half a catalogue is how a
 * page goes on selling six of the eight things it advertises.
 */
async function fromRemote<T>(
  organizationId: string,
  read: () => Promise<T>,
  whenAbsent: T
): Promise<T> {
  const connection = await loadConnection(organizationId)
  if (!connection || !connection.isActive) return whenAbsent
  return read()
}

// ── Browsing ─────────────────────────────────────────────────────────────

/**
 * A page of the merged catalogue.
 *
 * Local products come first and all at once; the cursor belongs to the remote
 * catalogue, so page two onwards is the merchant's website alone. Interleaving
 * the two by some shared sort order would need a total ordering across a table
 * we can query and a website we cannot, which does not exist.
 */
export async function listProducts(
  organizationId: string,
  query: ProductQuery = {}
): Promise<ProductPage> {
  const limit = query.limit ?? DEFAULT_LIMIT

  const [connected, local, remote] = await Promise.all([
    hasCatalogSource(organizationId),
    // Only the first page carries local products: a cursor means the caller is
    // already past them.
    query.cursor
      ? Promise.resolve({ products: [], nextCursor: null, total: 0 })
      : listLocalProducts(organizationId, {
          ...query,
          take: Math.min(limit, LOCAL_PAGE_LIMIT),
        }),
    fromRemote(
      organizationId,
      () => listRemoteProducts(organizationId, query),
      {
        products: [],
        nextCursor: null,
        total: null,
      }
    ),
  ])

  return {
    products: [...local.products, ...remote.products],
    nextCursor: remote.nextCursor,
    // Null means "not knowable", which is the honest answer whenever a connected
    // website is in the mix and did not report a count of its own. Without a
    // connection the local count *is* the whole count, and reporting null there
    // would make a local-only workspace look uncountable.
    total: !connected
      ? local.total
      : remote.total === null
        ? null
        : (local.total ?? 0) + remote.total,
  }
}

async function listRemoteProducts(
  organizationId: string,
  query: ProductQuery
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
  // the local catalogue applies: publication status is the merchant's statement
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
 * Search, across both catalogues, with a fallback for sites that cannot.
 *
 * A connector that does not implement `search` still gets a usable product
 * picker: its first page is fetched and filtered here. That is a worse search
 * over a smaller set, and much better than a dashboard that cannot find
 * anything on a site whose developer skipped one query parameter. Local
 * products are always searched properly, in SQL.
 */
export async function searchProducts(
  organizationId: string,
  term: string,
  options: { limit?: number; includeDrafts?: boolean } = {}
): Promise<CatalogProduct[]> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const needle = term.trim().toLowerCase()

  const [local, remote] = await Promise.all([
    listLocalProducts(organizationId, {
      q: needle || undefined,
      includeDrafts: options.includeDrafts,
      take: limit,
    }),
    fromRemote(
      organizationId,
      () => searchRemote(organizationId, needle, options),
      [] as CatalogProduct[]
    ),
  ])

  return [...local.products, ...remote].slice(
    0,
    Math.max(limit, local.products.length)
  )
}

async function searchRemote(
  organizationId: string,
  needle: string,
  options: { limit?: number; includeDrafts?: boolean }
): Promise<CatalogProduct[]> {
  const connection = await requireConnection(organizationId)
  const limit = options.limit ?? DEFAULT_LIMIT

  if (connection.capabilities.search && needle) {
    const page = await listRemoteProducts(organizationId, {
      q: needle,
      limit,
      includeDrafts: options.includeDrafts,
    })
    return page.products
  }

  const page = await listRemoteProducts(organizationId, {
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
  ): Promise<CatalogProduct | null> => {
    const local = await getLocalProduct(organizationId, idOrHandle)
    if (local) return local

    return fromRemote(
      organizationId,
      () => getRemoteProduct(organizationId, idOrHandle),
      null
    )
  }
)

async function getRemoteProduct(
  organizationId: string,
  idOrHandle: string
): Promise<CatalogProduct | null> {
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

/**
 * Remote products by id, in one call per fifty.
 *
 * The memo key is the sorted id list, so two sections asking for overlapping
 * sets in different orders still share a call.
 */
const remoteProductsByKey = cache(
  async (organizationId: string, key: string): Promise<CatalogProduct[]> => {
    const ids = key.split(',').filter(Boolean)
    if (ids.length === 0) return []

    const batches: string[][] = []
    for (let index = 0; index < ids.length; index += ID_BATCH) {
      batches.push(ids.slice(index, index + ID_BATCH))
    }

    const pages = await Promise.all(
      batches.map((batch) =>
        listRemoteProducts(organizationId, {
          ids: batch,
          limit: batch.length,
          includeDrafts: true,
        })
      )
    )

    const found = new Map(
      pages
        .flatMap((page) => page.products)
        .map((product) => [product.id, product])
    )

    // A site that ignores `ids` and returns its first page instead would
    // silently give the wrong products; asking for what is still missing one at
    // a time both fixes that and covers a connector whose list endpoint cannot
    // filter.
    const missing = ids.filter((id) => !found.has(id))
    if (missing.length > 0 && missing.length <= ID_BATCH) {
      const singles = await Promise.all(
        missing.map((id) =>
          getRemoteProduct(organizationId, id).catch((error: unknown) => {
            if (isCatalogError(error) && error.failure === 'contract')
              return null
            throw error
          })
        )
      )
      for (const product of singles) {
        if (product) found.set(product.id, product)
      }
    }

    return [...found.values()]
  }
)

export async function getProductsByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, CatalogProduct>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const local = await getLocalProductsByIds(organizationId, unique)
  const missing = unique.filter((id) => !local.has(id)).sort()

  if (missing.length === 0) return local

  const remote = await fromRemote(
    organizationId,
    () => remoteProductsByKey(organizationId, missing.join(',')),
    [] as CatalogProduct[]
  )

  const merged = new Map(local)
  for (const product of remote) merged.set(product.id, product)
  return merged
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
 *
 * Local references are answered in one query; whatever is left is asked of the
 * merchant's website. An offer that mixes the two therefore costs one query and
 * one HTTP call, not one per line.
 */
export async function resolveVariants(
  organizationId: string,
  refs: VariantRef[]
): Promise<Map<string, ResolvedVariant>> {
  const resolved = new Map<string, ResolvedVariant>()
  if (refs.length === 0) return resolved

  const wanted = [...new Set(refs.map((ref) => ref.variantId))]

  const local = await getLocalVariantsByIds(organizationId, wanted)
  for (const [id, entry] of local) {
    resolved.set(id, { ...entry, source: 'LOCAL' })
  }

  const outstanding = refs.filter((ref) => !resolved.has(ref.variantId))
  if (outstanding.length === 0) return resolved

  const connection = await loadConnection(organizationId)
  if (!connection || !connection.isActive) return resolved

  const productIds = [
    ...new Set(
      outstanding
        .map((ref) => ref.productId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]

  const products = new Map(
    (
      await remoteProductsByKey(
        organizationId,
        [...productIds].sort().join(',')
      )
    ).map((product) => [product.id, product])
  )

  const stillWanted = new Set(outstanding.map((ref) => ref.variantId))
  for (const product of products.values()) {
    for (const variant of product.variants) {
      if (stillWanted.has(variant.id)) {
        resolved.set(variant.id, { variant, product, source: 'REMOTE' })
      }
    }
  }

  // References saved without a product id — or whose product moved — go through
  // the optional /variants endpoint, if the site has one.
  const orphans = outstanding
    .map((ref) => ref.variantId)
    .filter((id) => !resolved.has(id))

  if (orphans.length === 0) return resolved

  const variants = await fetchRemoteVariants(organizationId, orphans)
  for (const variant of variants) {
    const product = products.get(variant.productId)
    resolved.set(variant.id, {
      variant,
      product: product ?? syntheticProduct(variant),
      source: 'REMOTE',
    })
  }

  return resolved
}

async function fetchRemoteVariants(
  organizationId: string,
  ids: string[]
): Promise<CatalogVariant[]> {
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
function syntheticProduct(variant: CatalogVariant): CatalogProduct {
  return {
    source: variant.source,
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
 * What can be sold right now, for a set of variants from either catalogue.
 *
 * Local lines are summed from InventoryLevel. Remote ones prefer the dedicated
 * `/stock` endpoint because it is the one call a merchant can make fast — it is
 * asked on every cart render and again inside every checkout — and fall back to
 * reading the products when a site does not implement it.
 */
export async function getStock(
  organizationId: string,
  refs: VariantRef[]
): Promise<Map<string, StockState>> {
  const stock = new Map<string, StockState>()
  if (refs.length === 0) return stock

  const ids = [...new Set(refs.map((ref) => ref.variantId))]

  for (const [id, state] of await getLocalStock(organizationId, ids)) {
    stock.set(id, state)
  }

  const outstanding = refs.filter((ref) => !stock.has(ref.variantId))
  if (outstanding.length === 0) return stock

  const connection = await loadConnection(organizationId)
  if (!connection || !connection.isActive) return stock

  if (connection.capabilities.stock) {
    try {
      const payload = await catalogFetch(connection, {
        method: 'POST',
        path: '/stock',
        body: { ids: outstanding.map((ref) => ref.variantId) },
      })
      for (const [id, row] of parseStock(payload)) {
        stock.set(id, row)
      }
    } catch (error) {
      if (!isCatalogError(error) || error.failure !== 'contract') throw error
    }
  }

  const missing = outstanding.filter((ref) => !stock.has(ref.variantId))
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

/** Re-exported so callers need only this module for the common path. */
export { isSellable }

/**
 * Splits references by which catalogue owns them.
 *
 * The stock path's routing primitive: local units are moved by us inside the
 * checkout transaction, remote ones are asked of the merchant's website before
 * it. Callers that already hold a resolution should read `source` off that
 * instead of asking again.
 */
export async function splitBySource<T extends VariantRef>(
  organizationId: string,
  refs: T[]
): Promise<{ local: T[]; remote: T[] }> {
  if (refs.length === 0) return { local: [], remote: [] }

  const localVariants = await getLocalVariantsByIds(
    organizationId,
    refs.map((ref) => ref.variantId)
  )

  return {
    local: refs.filter((ref) => localVariants.has(ref.variantId)),
    remote: refs.filter((ref) => !localVariants.has(ref.variantId)),
  }
}

// ── Categories ───────────────────────────────────────────────────────────

/**
 * Both trees, or one of them.
 *
 * `source` exists for callers that already have the local rows in a richer
 * shape than this — the dashboard's tree needs `isActive` and per-node counts,
 * which are local-only columns — and would otherwise pay for a query they are
 * about to throw away.
 */
export async function listCategories(
  organizationId: string,
  options: { source?: CatalogSource } = {}
): Promise<CatalogCategory[]> {
  const [local, remote] = await Promise.all([
    options.source === 'REMOTE'
      ? Promise.resolve([] as CatalogCategory[])
      : listLocalCategories(organizationId),
    options.source === 'LOCAL'
      ? Promise.resolve([] as CatalogCategory[])
      : fromRemote(
          organizationId,
          () => listRemoteCategories(organizationId),
          [] as CatalogCategory[]
        ),
  ])

  return [...local, ...remote]
}

async function listRemoteCategories(
  organizationId: string
): Promise<CatalogCategory[]> {
  const connection = await requireConnection(organizationId)
  if (!connection.capabilities.categories) return []

  const payload = await catalogFetch(connection, {
    method: 'GET',
    path: '/categories',
    capability: 'categories',
  })
  return parseCategories(payload)
}

// ── Stock movements on the merchant's side ───────────────────────────────

/**
 * Asks the merchant's system to hold stock for an order.
 *
 * Remote lines only — local stock is moved by inventoryService with a
 * conditional decrement inside the checkout transaction, which is a stronger
 * guarantee than anything reachable over HTTP and is available precisely
 * because those rows are ours.
 *
 * NCOM does not own the numbers on the other side and cannot decrement them;
 * the most it can do is ask, and report honestly when the answer is no. A site
 * that implements `/reserve` gets the same guarantee a local product has. A site
 * that does not gets a best-effort check moments earlier and, if two shoppers
 * race for the last unit, an oversell the merchant resolves the way they did
 * before they had us.
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
