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
import { outstandingHolds, recordStockHolds, withStockLock } from './queue'
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

/**
 * A page of the merchant's website only — no local rows mixed in.
 *
 * Exported for the one caller that needs the two catalogues held apart rather
 * than merged: the tool that matches a workspace's own products against their
 * twins on the merchant's site before deleting them (scripts/adopt-remote-
 * products.mts). Everything else wants `listProducts`.
 */
export async function listRemoteProducts(
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
 * picker: its pages are fetched and filtered here. That is a worse search over
 * a smaller set, and much better than a dashboard that cannot find anything on
 * a site whose developer skipped one query parameter. Local products are always
 * searched properly, in SQL.
 *
 * One page of the answer. Everything that needs the whole catalogue — every
 * product picker in the dashboard — pages through with the cursor rather than
 * asking for a bigger number, because "give me all 40,000 products so someone
 * can tick three" is a request to a merchant's own server.
 */
export async function searchProducts(
  organizationId: string,
  term: string,
  options: { limit?: number; includeDrafts?: boolean } = {}
): Promise<CatalogProduct[]> {
  const page = await searchProductPage(organizationId, term, options)
  return page.products
}

/**
 * Where a paged search is up to: one number for our table, one opaque string
 * for their website, and whether their website has run out.
 *
 * Encoded rather than exposed because half of it is the merchant's own cursor,
 * whose format is theirs and may be anything.
 */
interface SearchCursor {
  /** Local rows already spent. Null once the table is exhausted. */
  local: number | null
  /** Where their site is up to. Null before the first call. */
  remote: string | null
  /** True once their site has said there is no next page. */
  remoteDone: boolean
}

const SEARCH_START: SearchCursor = { local: 0, remote: null, remoteDone: false }

function encodeSearchCursor(state: SearchCursor): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url')
}

/** A cursor we did not mint — or one from another list — restarts the search. */
function decodeSearchCursor(cursor: string | null | undefined): SearchCursor {
  if (!cursor) return SEARCH_START

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    )
    if (!parsed || typeof parsed !== 'object') return SEARCH_START

    const { local, remote, remoteDone } = parsed as Record<string, unknown>
    return {
      local: typeof local === 'number' && local >= 0 ? local : null,
      remote: typeof remote === 'string' ? remote : null,
      remoteDone: remoteDone === true,
    }
  } catch {
    return SEARCH_START
  }
}

/** What the remote half contributes when the workspace has no site connected. */
const NO_REMOTE: ProductPage = { products: [], nextCursor: null, total: 0 }

/**
 * The merged search, one page at a time.
 *
 * While both catalogues still have rows they split the page; once one is spent
 * the other takes all of it. Each side is asked for exactly as many products as
 * will be shown, which is what makes paging safe: a remote product fetched and
 * then sliced off the end of a fixed-size list is one the next cursor has
 * already moved past, and it would never be seen again. The old fixed-share
 * version could only ever return one page for that reason, so a picker showed
 * the first sixty products of a catalogue and nothing else existed as far as
 * the merchant could tell.
 */
export async function searchProductPage(
  organizationId: string,
  term: string,
  options: {
    limit?: number
    cursor?: string | null
    includeDrafts?: boolean
  } = {}
): Promise<ProductPage> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const needle = term.trim().toLowerCase()
  const state = decodeSearchCursor(options.cursor)

  const localWanted =
    state.local === null ? 0 : state.remoteDone ? limit : Math.ceil(limit / 2)

  // Our own table first, and then their website for whatever is left of the
  // page. Sequential rather than side by side on purpose: the second call has
  // to ask for exactly the number of products that will be shown, and one
  // indexed query against our own database is a rounding error next to an HTTP
  // call to a merchant's shared host. Asking for more and slicing would be the
  // bug this function exists to avoid — a fetched product cut off the end of a
  // page is one the next cursor has already moved past.
  const local =
    localWanted === 0
      ? { products: [], nextCursor: null, total: 0 }
      : await listLocalProducts(organizationId, {
          q: needle || undefined,
          includeDrafts: options.includeDrafts,
          take: localWanted,
          skip: state.local ?? 0,
        })

  const remote = state.remoteDone
    ? NO_REMOTE
    : await fromRemote(
        organizationId,
        () =>
          searchRemotePage(organizationId, needle, {
            // Never zero: a page that asked their site for nothing would come
            // back empty and read as a site with nothing left in it.
            limit: Math.max(1, limit - local.products.length),
            cursor: state.remote,
            includeDrafts: options.includeDrafts,
          }),
        NO_REMOTE
      )

  const spentLocal = (state.local ?? 0) + local.products.length
  const localDone =
    state.local === null ||
    local.products.length < localWanted ||
    spentLocal >= (local.total ?? 0)
  const remoteDone = state.remoteDone || remote.nextCursor === null

  return {
    products: [...local.products, ...remote.products],
    nextCursor:
      localDone && remoteDone
        ? null
        : encodeSearchCursor({
            local: localDone ? null : spentLocal,
            remote: remote.nextCursor,
            remoteDone,
          }),
    // Only the first page can honestly state the size of the whole, and only
    // when their site counted its half. Null means "not knowable", which is
    // what a picker showing "60 of ?" needs to be told.
    total:
      state.local === 0 && state.remote === null && remote.total !== null
        ? (local.total ?? 0) + remote.total
        : null,
  }
}

/** How many of their pages the fallback filter pulls before giving up. */
const FILTER_PAGE_LIMIT = 5

async function searchRemotePage(
  organizationId: string,
  needle: string,
  options: {
    limit: number
    cursor: string | null
    includeDrafts?: boolean
  }
): Promise<ProductPage> {
  const connection = await requireConnection(organizationId)

  if (!needle || connection.capabilities.search) {
    return listRemoteProducts(organizationId, {
      q: needle || undefined,
      limit: options.limit,
      cursor: options.cursor,
      includeDrafts: options.includeDrafts,
    })
  }

  // Their site cannot search, so pages are pulled and filtered here. A page
  // whose matches all fall out is not the end of the catalogue, so this keeps
  // walking — up to a bound, because "matches nothing" must not turn one
  // keystroke into forty thousand products fetched from a merchant's shop.
  const matched: CatalogProduct[] = []
  let cursor = options.cursor
  let total: number | null = null

  for (let page = 0; page < FILTER_PAGE_LIMIT; page++) {
    const fetched: ProductPage = await listRemoteProducts(organizationId, {
      limit: Math.max(options.limit, 50),
      cursor,
      includeDrafts: options.includeDrafts,
    })

    total = fetched.total
    matched.push(
      ...fetched.products.filter((product) => matches(product, needle))
    )
    cursor = fetched.nextCursor

    if (!cursor || matched.length >= options.limit) break
  }

  return { products: matched, nextCursor: cursor, total }
}

/** The fields a merchant expects a search box to look at. */
function matches(product: CatalogProduct, needle: string): boolean {
  const haystack = [
    product.title,
    product.handle,
    product.vendor ?? '',
    ...product.variants.map((variant) => variant.sku ?? ''),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(needle)
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
      // Also a read — ids in, variants out. See the note on /stock above.
      replayable: true,
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
 *
 * Remote figures then have this workspace's own outstanding holds subtracted.
 * A merchant's connector reports what *their* system believes it has, and their
 * system does not learn about an NCOM sale until it processes the order webhook
 * — so between those two moments their number still counts units that are
 * already sold. Reporting it unadjusted is what let two shoppers be shown the
 * same last shirt. See queue.ts.
 */
export async function getStock(
  organizationId: string,
  refs: VariantRef[],
  options: { excludeOrderRef?: string } = {}
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
        // A read, despite the verb — it takes a list of ids and returns counts.
        // Worth replaying, and the call most likely to meet a cold server,
        // because it is the first thing a storefront render asks for.
        replayable: true,
      })
      for (const [id, row] of parseStock(payload)) {
        stock.set(id, row)
      }
    } catch (error) {
      if (!isCatalogError(error) || error.failure !== 'contract') throw error
    }
  }

  const missing = outstanding.filter((ref) => !stock.has(ref.variantId))
  if (missing.length > 0) {
    const resolved = await resolveVariants(organizationId, missing)
    for (const [id, entry] of resolved) {
      stock.set(id, {
        available: entry.variant.available,
        policy: entry.variant.policy,
      })
    }
  }

  // Only the remote ids. Local variants cannot have a hold — their units were
  // taken from our own ledger, which is already what `getLocalStock` read.
  const holds = await outstandingHolds(
    organizationId,
    outstanding.map((ref) => ref.variantId),
    options
  )

  for (const [variantId, quantity] of holds) {
    const state = stock.get(variantId)
    // Null stays null: a site that does not count cannot be counted down.
    if (!state || state.available === null) continue
    stock.set(variantId, {
      ...state,
      available: Math.max(0, state.available - quantity),
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

/**
 * Takes units from the merchant's website: checked, claimed, and written down.
 *
 * The three steps have to happen together or they mean nothing, so they happen
 * under one lock per variant and every other checkout for the same variant
 * queues behind them:
 *
 *   1. Read their live figure, with this workspace's own outstanding holds
 *      already subtracted (`getStock` does that). Reading it outside the lock
 *      is the original bug — two checkouts both see the same "1 available"
 *      before either has taken anything.
 *
 *   2. Ask their site to hold the units, where it implements `/reserve`.
 *      Inside the lock, so the next checkout's step 1 already reflects it.
 *
 *   3. Record the hold, which is what makes step 1 true for the next checkout
 *      on a site with no `/reserve`, where nothing on the merchant's side moves
 *      until they process the order webhook.
 *
 * Throws when the units are not there. The merchant site's own refusal is
 * passed through verbatim where it gave one — "only 1 left" from the shop that
 * knows beats anything this function could phrase.
 */
export async function takeRemoteStock(
  organizationId: string,
  orderRef: string,
  lines: (StockMovementLine & { productId?: string | null })[]
): Promise<boolean> {
  if (lines.length === 0) return false

  return withStockLock(
    organizationId,
    lines.map((line) => line.variantId),
    async () => {
      // Its own holds are excluded: a retried submit re-reads while its first
      // attempt's hold is still outstanding, and counting that against itself
      // would refuse a sale it has already claimed the units for.
      const stock = await getStock(
        organizationId,
        lines.map((line) => ({
          variantId: line.variantId,
          productId: line.productId ?? null,
        })),
        { excludeOrderRef: orderRef }
      )

      for (const line of lines) {
        const state = stock.get(line.variantId)
        if (!state || isSellable(state, line.quantity)) continue

        const available = state.available ?? 0
        throw new Error(
          available > 0
            ? `Only ${available} left of one of these items. Lower the quantity to continue.`
            : 'One of these items sold out while you were checking out'
        )
      }

      const reserves = await canReserve(organizationId)

      if (reserves) {
        const result = await reserveStock(organizationId, orderRef, lines)
        if (!result.ok) {
          const first = result.rejected[0]
          throw new Error(first?.reason ?? 'Some items are no longer in stock')
        }
      }

      // CONFIRMED where their site moved its own count, so the next read of it
      // already excludes these units and subtracting them again here would make
      // the shop under-sell by exactly what it just sold.
      await recordStockHolds(
        organizationId,
        orderRef,
        lines,
        reserves ? 'CONFIRMED' : 'PENDING'
      )

      return true
    }
  )
}
