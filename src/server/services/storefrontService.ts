import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db/client'
import {
  getProduct,
  getProductsByIds,
  hasCatalogSource,
  isCatalogError,
  isSellable,
  listCategories,
  listProducts,
  listRemoteProducts,
  searchProducts,
  type CatalogProduct,
} from '@/server/catalog'
import { listLocalProducts } from '@/server/catalog/local'
import { getCollectionProducts } from './collectionService'
import { sanitizeDescription } from '@/modules/sections/sanitizeHtml'
import { getSectionDefinition } from '@/modules/sections/registry'
import {
  LISTING_SORTS,
  productQueryKey,
  type ListingSort,
  type StoreCategory,
  type StoreCollection,
  type StoreListing,
  type StoreProductCard,
  type StoreProductDetail,
  type StorefrontProductQuery,
} from '@/modules/sections/storefront'

/**
 * The catalogue, shaped for an online store's shelves.
 *
 * Everything a store shows a shopper comes through here: the cards in a grid,
 * a product's own page, a category, a search. It reads the same merged
 * catalogue the rest of the platform sells from — NCOM's own products and the
 * merchant's connected website — and turns it into the plain display shapes in
 * modules/sections/storefront.ts, which are what blocks render from.
 *
 * Read-only and unauthenticated by design: these are the pages a stranger
 * browses. Every query is scoped by the organisation the *store* belongs to,
 * resolved from the request's hostname by the caller, never by anything the
 * visitor sent. Drafts and archived products are never returned.
 */

/** Below this many units, a product page tells the shopper how many are left. */
const LOW_STOCK_THRESHOLD = 5

/** How many products a catalogue page can sort and page through at once. */
const LISTING_POOL = 200

// ── Shaping ──────────────────────────────────────────────────────────────

/**
 * A catalogue product as a card in a grid.
 *
 * The price shown is the cheapest variant's, which is the honest figure for
 * "how much is this?" on a shelf — and `priceVaries` lets the card say "from"
 * so a shopper is not surprised when their size costs more.
 */
export function toProductCard(product: CatalogProduct): StoreProductCard {
  const variants = product.variants
  const cheapest = [...variants].sort((a, b) => a.priceCents - b.priceCents)[0]
  const prices = new Set(variants.map((variant) => variant.priceCents))

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    imageUrl: product.images[0]?.url ?? cheapest?.imageUrl ?? null,
    hoverImageUrl: product.images[1]?.url ?? null,
    priceCents: cheapest?.priceCents ?? 0,
    compareAtPriceCents:
      cheapest?.compareAtPriceCents &&
      cheapest.compareAtPriceCents > cheapest.priceCents
        ? cheapest.compareAtPriceCents
        : null,
    priceVaries: prices.size > 1,
    available: variants.some((variant) => isSellable(variant)),
    quickAddVariantId:
      variants.length === 1 && isSellable(variants[0]!)
        ? variants[0]!.id
        : null,
    vendor: product.vendor,
  }
}

export function toProductDetail(product: CatalogProduct): StoreProductDetail {
  return {
    ...toProductCard(product),
    descriptionHtml: sanitizeDescription(product.description),
    images: product.images.map((image) => ({
      url: image.url,
      alt: image.alt,
    })),
    options: product.options.filter((option) => option.values.length > 0),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      options: variant.options,
      priceCents: variant.priceCents,
      compareAtPriceCents:
        variant.compareAtPriceCents &&
        variant.compareAtPriceCents > variant.priceCents
          ? variant.compareAtPriceCents
          : null,
      available: isSellable(variant),
      // Exact stock is only worth saying when it is about to run out: "only 3
      // left" helps a shopper decide, "412 in stock" tells a competitor how
      // the merchant is doing.
      stockLeft:
        variant.available !== null &&
        variant.policy === 'DENY' &&
        variant.available > 0 &&
        variant.available <= LOW_STOCK_THRESHOLD
          ? variant.available
          : null,
      imageUrl: variant.imageUrl,
    })),
    categoryId: product.categoryId,
    tags: product.tags,
  }
}

function isPublic(
  product: CatalogProduct | undefined
): product is CatalogProduct {
  return product !== undefined && product.status === 'ACTIVE'
}

// ── The shop around a page ───────────────────────────────────────────────

export interface StoreCatalogue {
  currencyCode: string
  accountsEnabled: boolean
  categories: StoreCategory[]
  collections: StoreCollection[]
  /** False when products come from a website that did not answer. */
  catalogueAvailable: boolean
}

/**
 * The categories, collections and settings every page of a store draws on.
 *
 * Memoised per request: the header's menu, a category grid and the catalogue
 * page all ask, and one render should ask the merchant's website once.
 */
export const loadStoreCatalogue = cache(
  async (organizationId: string): Promise<StoreCatalogue> => {
    const [settings, collections] = await Promise.all([
      prisma.organizationSettings.findUnique({
        where: { organizationId },
        select: { currencyCode: true, customerAccountsEnabled: true },
      }),
      prisma.collection.findMany({
        where: { organizationId, publishedAt: { not: null } },
        select: { id: true, handle: true, title: true, imageMediaId: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    let categories: StoreCategory[] = []
    let catalogueAvailable = true
    try {
      categories = (await listCategories(organizationId)).map((category) => ({
        id: category.id,
        handle: category.handle,
        name: category.name,
        parentId: category.parentId,
        imageUrl: category.imageUrl,
        productCount: category.productCount,
      }))
    } catch (error) {
      // A website that is down takes its categories with it, but not the
      // store: the header still renders, and so do NCOM's own categories on
      // the next request once it answers.
      if (!isCatalogError(error)) throw error
      catalogueAvailable = false
    }

    const collectionImages = await mediaUrls(
      collections.map((collection) => collection.imageMediaId)
    )

    return {
      currencyCode: settings?.currencyCode ?? 'BDT',
      accountsEnabled: settings?.customerAccountsEnabled ?? true,
      categories,
      collections: collections.map((collection) => ({
        id: collection.id,
        handle: collection.handle,
        title: collection.title,
        imageUrl: collection.imageMediaId
          ? (collectionImages.get(collection.imageMediaId) ?? null)
          : null,
      })),
      catalogueAvailable,
    }
  }
)

async function mediaUrls(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return new Map()
  const rows = await prisma.mediaAsset.findMany({
    where: { id: { in: wanted } },
    select: { id: true, url: true },
  })
  return new Map(rows.map((row) => [row.id, row.url]))
}

/**
 * The products every block on a page asked for, keyed by section id.
 *
 * Each block's definition says what it wants (`productQuery`); this runs every
 * distinct question once, in parallel. A website that fails one question fails
 * only the blocks that asked it — the rest of the page still renders — and the
 * caller is told, so the blocks can say "back soon" instead of "no products".
 */
export async function resolveSectionProducts(
  organizationId: string,
  sections: { id: string; type: string; content: unknown }[],
  current?: StoreProductDetail | null
): Promise<{
  sectionProducts: Record<string, StoreProductCard[]>
  unavailable: boolean
}> {
  const wanted = sections.flatMap((section) => {
    const query = sectionProductQuery(section)
    return query ? [{ sectionId: section.id, query }] : []
  })

  const distinct = new Map<string, StorefrontProductQuery>()
  for (const { query } of wanted) distinct.set(productQueryKey(query), query)

  let unavailable = false
  const answers = new Map<string, StoreProductCard[]>()
  await Promise.all(
    [...distinct.entries()].map(async ([key, query]) => {
      try {
        answers.set(key, await runProductQuery(organizationId, query, current))
      } catch (error) {
        if (!isCatalogError(error)) throw error
        unavailable = true
        answers.set(key, [])
      }
    })
  )

  const sectionProducts: Record<string, StoreProductCard[]> = {}
  for (const { sectionId, query } of wanted) {
    sectionProducts[sectionId] = answers.get(productQueryKey(query)) ?? []
  }
  return { sectionProducts, unavailable }
}

/** What one section wants, from its block definition and its saved content. */
export function sectionProductQuery(section: {
  type: string
  content: unknown
}): StorefrontProductQuery | null {
  const definition = getSectionDefinition(section.type)
  if (!definition?.productQuery) return null
  const parsed = definition.schema.safeParse(section.content)
  return definition.productQuery(
    parsed.success ? parsed.data : definition.defaultContent
  )
}

/** Answers one product question. Exported for the builder canvas. */
export async function runProductQuery(
  organizationId: string,
  query: StorefrontProductQuery,
  current?: StoreProductDetail | null
): Promise<StoreProductCard[]> {
  const limit = Math.min(Math.max(query.limit, 1), 48)

  switch (query.source) {
    case 'picked': {
      const ids = (query.productIds ?? []).slice(0, limit)
      const found = await getProductsByIds(organizationId, ids)
      return ids
        .map((id) => found.get(id))
        .filter(isPublic)
        .map(toProductCard)
    }

    case 'refs': {
      // Ids first, in the one query (and one call to the merchant's website)
      // a set of ids costs; whatever that did not find is taken to be a
      // handle and looked up on its own. Capped well below a page's worth,
      // because each handle can be a request of its own.
      const refs = [
        ...new Set(
          (query.productRefs ?? []).filter(
            (ref): ref is string =>
              typeof ref === 'string' && ref.length > 0 && ref.length <= 200
          )
        ),
      ].slice(0, Math.min(limit, 24))
      const byId = await getProductsByIds(organizationId, refs)
      const found = await Promise.all(
        refs.map((ref) => byId.get(ref) ?? getProduct(organizationId, ref))
      )
      const seen = new Set<string>()
      return found
        .filter((product): product is CatalogProduct => {
          if (!product || seen.has(product.id)) return false
          seen.add(product.id)
          return isPublic(product)
        })
        .map(toProductCard)
    }

    case 'collection': {
      if (!query.collectionId) return newest(organizationId, limit)
      const rows = await getCollectionProducts(
        organizationId,
        query.collectionId,
        { take: limit, publishedOnly: true }
      ).catch(() => [])
      const found = await getProductsByIds(
        organizationId,
        rows.map((row) => row.id)
      )
      return rows
        .map((row) => found.get(row.id))
        .filter(isPublic)
        .map(toProductCard)
    }

    case 'category': {
      if (!query.categoryId) return newest(organizationId, limit)
      const products = await productsInCategory(
        organizationId,
        query.categoryId,
        limit
      )
      return products.slice(0, limit).map(toProductCard)
    }

    case 'related': {
      // The product's own category first, because "more like this" is what
      // the shopper is looking at; the newest products after, so a product
      // alone in its category still gets a row underneath it.
      const exclude = current?.id
      const pool = current?.categoryId
        ? await productsInCategory(
            organizationId,
            current.categoryId,
            limit + 1
          )
        : []
      const cards = pool
        .filter((product) => product.id !== exclude)
        .map(toProductCard)
      if (cards.length < limit) {
        const more = await newest(organizationId, limit + 1)
        for (const card of more) {
          if (card.id === exclude || cards.some((c) => c.id === card.id))
            continue
          cards.push(card)
        }
      }
      return cards.slice(0, limit)
    }

    default:
      return newest(organizationId, limit)
  }
}

async function newest(
  organizationId: string,
  limit: number
): Promise<StoreProductCard[]> {
  const page = await listProducts(organizationId, { limit })
  return page.products.filter(isPublic).slice(0, limit).map(toProductCard)
}

/**
 * A category's products, including those filed under its subcategories.
 *
 * Local categories are a tree NCOM owns, so their descendants are known and
 * queried in one go. A category on the merchant's website is asked of the
 * website, which answers for its own tree however it models it.
 */
async function productsInCategory(
  organizationId: string,
  categoryId: string,
  limit: number
): Promise<CatalogProduct[]> {
  const local = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  })

  if (local) {
    const all = await prisma.category.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, parentId: true },
    })
    const ids = descendantsOf(categoryId, all)
    const page = await listLocalProducts(organizationId, {
      categoryIds: ids,
      take: limit,
    })
    return page.products.filter(isPublic)
  }

  if (!(await hasCatalogSource(organizationId))) return []
  const page = await listRemoteProducts(organizationId, {
    categoryId,
    limit,
  })
  return page.products.filter(isPublic)
}

function descendantsOf(
  rootId: string,
  categories: { id: string; parentId: string | null }[]
): string[] {
  const children = new Map<string, string[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    const list = children.get(category.parentId) ?? []
    list.push(category.id)
    children.set(category.parentId, list)
  }
  const out: string[] = []
  const queue = [rootId]
  // Depth is capped at three levels by categoryService; the visited guard is
  // for a mis-parented row, which must not spin this forever.
  while (queue.length > 0 && out.length < 500) {
    const id = queue.shift()!
    if (out.includes(id)) continue
    out.push(id)
    queue.push(...(children.get(id) ?? []))
  }
  return out
}

// ── A product's own page ─────────────────────────────────────────────────

/** The product at this handle, or null when there is none a shopper may see. */
export async function getStoreProduct(
  organizationId: string,
  handle: string
): Promise<StoreProductDetail | null> {
  const product = await getProduct(organizationId, handle)
  if (!isPublic(product ?? undefined)) return null
  return toProductDetail(product!)
}

// ── Catalogue pages ──────────────────────────────────────────────────────

export interface ListingRequest {
  kind: StoreListing['kind']
  handle?: string | null
  query?: string | null
  sort?: string | null
  page?: number
  perPage?: number
}

export function parseSort(value: string | null | undefined): ListingSort {
  return (LISTING_SORTS as readonly string[]).includes(value ?? '')
    ? (value as ListingSort)
    : 'featured'
}

/**
 * A page of a category, a collection, a search or the whole shop.
 *
 * Sorted and paged here, over a pool of up to `LISTING_POOL` products, rather
 * than by the catalogue: a merchant's website answers in its own order and
 * has no contract for sorting by price, and NCOM's own table is small enough
 * that sorting it in memory is cheaper than teaching two catalogues one sort
 * order. A catalogue larger than the pool shows its first two hundred — the
 * search box reaches the rest.
 *
 * Null when the category or collection does not exist, so the page can 404.
 */
export async function getStoreListing(
  organizationId: string,
  request: ListingRequest,
  catalogue: StoreCatalogue
): Promise<StoreListing | null> {
  const sort = parseSort(request.sort)
  const perPage = Math.min(Math.max(request.perPage ?? 24, 4), 60)

  let title = 'All products'
  let description: string | null = null
  let imageUrl: string | null = null
  let handle: string | null = null
  let subcategories: StoreCategory[] = []
  let pool: CatalogProduct[] = []

  if (request.kind === 'category') {
    const category = catalogue.categories.find(
      (candidate) => candidate.handle === request.handle
    )
    if (!category) return null
    const local = await prisma.category.findFirst({
      where: { id: category.id, organizationId },
      select: { description: true, isActive: true },
    })
    if (local && !local.isActive) return null

    title = category.name
    description = local?.description ?? null
    imageUrl = category.imageUrl
    handle = category.handle
    subcategories = catalogue.categories.filter(
      (candidate) => candidate.parentId === category.id
    )
    pool = await productsInCategory(organizationId, category.id, LISTING_POOL)
  } else if (request.kind === 'collection') {
    const collection = await prisma.collection.findFirst({
      where: {
        organizationId,
        handle: request.handle ?? '',
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        description: true,
        handle: true,
        imageMediaId: true,
      },
    })
    if (!collection) return null
    title = collection.title
    description = collection.description
    handle = collection.handle
    imageUrl =
      catalogue.collections.find((c) => c.id === collection.id)?.imageUrl ??
      null
    const rows = await getCollectionProducts(organizationId, collection.id, {
      take: LISTING_POOL,
      publishedOnly: true,
    })
    const found = await getProductsByIds(
      organizationId,
      rows.map((row) => row.id)
    )
    pool = rows.map((row) => found.get(row.id)).filter(isPublic)
  } else if (request.kind === 'search') {
    const term = (request.query ?? '').trim().slice(0, 100)
    title = term ? `Results for “${term}”` : 'Search'
    pool = term
      ? (await searchProducts(organizationId, term, { limit: 60 })).filter(
          isPublic
        )
      : []
  } else {
    const page = await listProducts(organizationId, { limit: 100 })
    pool = page.products.filter(isPublic)
  }

  const cards = sortCards(pool.map(toProductCard), sort)
  const pageCount = Math.max(1, Math.ceil(cards.length / perPage))
  const page = Math.min(Math.max(request.page ?? 1, 1), pageCount)

  return {
    kind: request.kind,
    title,
    description,
    imageUrl,
    handle,
    query: request.kind === 'search' ? (request.query ?? '') : null,
    products: cards.slice((page - 1) * perPage, page * perPage),
    total: cards.length,
    page,
    pageCount,
    sort,
    subcategories,
  }
}

function sortCards(
  cards: StoreProductCard[],
  sort: ListingSort
): StoreProductCard[] {
  const sorted = [...cards]
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.priceCents - b.priceCents)
    case 'price-desc':
      return sorted.sort((a, b) => b.priceCents - a.priceCents)
    case 'name':
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
    // "Featured" and "Newest" are the order the catalogue answered in, which
    // is newest-first for NCOM's own products and the merchant's own order for
    // their website's. Sold-out products sink either way: a shelf that opens
    // on four things nobody can buy reads as a closed shop.
    default:
      return sorted.sort((a, b) => Number(b.available) - Number(a.available))
  }
}
