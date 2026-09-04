import 'server-only'
import { prisma } from '@/server/db/client'
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogVariant,
  ProductPage,
  ProductQuery,
  StockState,
} from './types'

/**
 * Products kept in NCOM's own database.
 *
 * The second of the two catalogues a workspace sells from. A merchant connects
 * their website for the goods they already sell, and adds products here for the
 * ones they do not: a bundle-only item, a campaign gift, a sample, something
 * they are testing before it goes on the real shop.
 *
 * These are ordinary rows and NCOM owns them completely — it can create, edit
 * and delete them, and it moves their stock itself with the conditional
 * decrement in inventoryService. That is the whole difference from a remote
 * product, and it is why `source` travels on every shape this module produces:
 * two places downstream have to behave differently, and neither should be
 * guessing which kind it is holding.
 *
 * Everything here is read-only. The writes live in productService, where they
 * always did.
 */

/** What a product needs for the catalogue shape, in one query shape. */
const PRODUCT_INCLUDE = {
  images: {
    orderBy: { position: 'asc' as const },
    include: { media: { select: { url: true } } },
  },
  options: { orderBy: { position: 'asc' as const } },
  variants: {
    orderBy: { position: 'asc' as const },
    include: {
      image: { include: { media: { select: { url: true } } } },
      inventoryLevels: { select: { available: true } },
    },
  },
  collections: { select: { collectionId: true } },
} as const

type ProductRow = Awaited<
  ReturnType<
    typeof prisma.product.findMany<{ include: typeof PRODUCT_INCLUDE }>
  >
>[number]

export async function listLocalProducts(
  organizationId: string,
  query: ProductQuery & { take?: number; skip?: number } = {}
): Promise<ProductPage> {
  const search = query.q?.trim()

  // One where clause for both the page and the count. Counting with a looser
  // filter than the rows were fetched with is how a screen ends up reporting
  // "1–20 of 412" over a search that matched three things.
  const where = {
    organizationId,
    ...(query.includeDrafts ? {} : { status: 'ACTIVE' as const }),
    ...(query.ids && query.ids.length > 0 ? { id: { in: query.ids } } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { handle: { contains: search, mode: 'insensitive' as const } },
            { vendor: { contains: search, mode: 'insensitive' as const } },
            {
              variants: {
                some: {
                  sku: { contains: search, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.take ?? query.limit ?? 100,
      skip: query.skip ?? 0,
      include: PRODUCT_INCLUDE,
    }),
    prisma.product.count({ where }),
  ])

  return { products: rows.map(toCatalogProduct), nextCursor: null, total }
}

export async function getLocalProduct(
  organizationId: string,
  idOrHandle: string
): Promise<CatalogProduct | null> {
  const row = await prisma.product.findFirst({
    where: {
      organizationId,
      OR: [{ id: idOrHandle }, { handle: idOrHandle }],
    },
    include: PRODUCT_INCLUDE,
  })

  return row ? toCatalogProduct(row) : null
}

/**
 * Which of these ids are ours, and what they are.
 *
 * The routing primitive: every merged read starts by asking this, and whatever
 * does not come back is asked of the merchant's website instead. One indexed
 * query, scoped by organisation — so an id from another workspace's catalogue
 * resolves to nothing here exactly as it should.
 */
export async function getLocalProductsByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, CatalogProduct>> {
  if (ids.length === 0) return new Map()

  const rows = await prisma.product.findMany({
    where: { organizationId, id: { in: ids } },
    include: PRODUCT_INCLUDE,
  })

  return new Map(rows.map((row) => [row.id, toCatalogProduct(row)]))
}

/** The same question for variant ids, which is what a cart line holds. */
export async function getLocalVariantsByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, { variant: CatalogVariant; product: CatalogProduct }>> {
  if (ids.length === 0) return new Map()

  const rows = await prisma.product.findMany({
    where: {
      organizationId,
      variants: { some: { id: { in: ids } } },
    },
    include: PRODUCT_INCLUDE,
  })

  const wanted = new Set(ids)
  const found = new Map<
    string,
    { variant: CatalogVariant; product: CatalogProduct }
  >()

  for (const row of rows) {
    const product = toCatalogProduct(row)
    for (const variant of product.variants) {
      if (wanted.has(variant.id)) found.set(variant.id, { variant, product })
    }
  }

  return found
}

/** Stock for local variants, summed across locations. */
export async function getLocalStock(
  organizationId: string,
  ids: string[]
): Promise<Map<string, StockState>> {
  if (ids.length === 0) return new Map()

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, product: { organizationId } },
    select: {
      id: true,
      inventoryTracked: true,
      inventoryPolicy: true,
      inventoryLevels: { select: { available: true } },
    },
  })

  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        // Untracked is null, not zero: the variant is infinitely available, and
        // reporting a count of zero would take it off sale.
        available: variant.inventoryTracked
          ? variant.inventoryLevels.reduce(
              (total, level) => total + level.available,
              0
            )
          : null,
        policy: variant.inventoryPolicy,
      },
    ])
  )
}

export async function listLocalCategories(
  organizationId: string
): Promise<CatalogCategory[]> {
  const rows = await prisma.category.findMany({
    where: { organizationId },
    orderBy: [{ level: 'asc' }, { position: 'asc' }],
    include: {
      image: { select: { url: true } },
      _count: { select: { products: true } },
    },
  })

  return rows.map((row) => ({
    source: 'LOCAL' as const,
    id: row.id,
    name: row.name,
    handle: row.handle,
    parentId: row.parentId,
    imageUrl: row.image?.url ?? null,
    productCount: row._count.products,
  }))
}

/** Whether a workspace has any products of its own at all. */
export async function hasLocalProducts(
  organizationId: string
): Promise<boolean> {
  const count = await prisma.product.count({
    where: { organizationId },
    take: 1,
  })
  return count > 0
}

// ── Shaping ──────────────────────────────────────────────────────────────

function toCatalogProduct(row: ProductRow): CatalogProduct {
  const images = row.images.map((image) => ({
    url: image.media.url,
    alt: image.altText,
  }))

  return {
    source: 'LOCAL',
    id: row.id,
    handle: row.handle,
    title: row.title,
    description: row.description,
    status: row.status,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    categoryId: row.categoryId,
    // What a scoped discount matches against. A local product's groups are its
    // category and its collections, which is the same question the connector
    // answers with `categoryIds` — see the note on groupIds in types.ts.
    groupIds: [
      ...new Set(
        [
          row.categoryId,
          ...row.collections.map((link) => link.collectionId),
        ].filter((value): value is string => value !== null)
      ),
    ],
    images,
    options: row.options.map((option) => ({
      name: option.name,
      values: option.values,
    })),
    variants: row.variants.map((variant) =>
      toCatalogVariant(variant, row.id, images[0]?.url ?? null)
    ),
    // Local products have no page of their own on anyone's website.
    url: null,
  }
}

function toCatalogVariant(
  variant: ProductRow['variants'][number],
  productId: string,
  fallbackImage: string | null
): CatalogVariant {
  return {
    source: 'LOCAL',
    id: variant.id,
    productId,
    title: variant.title,
    sku: variant.sku,
    barcode: variant.barcode,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    options: [variant.option1, variant.option2, variant.option3].filter(
      (value): value is string => typeof value === 'string' && value !== ''
    ),
    available: variant.inventoryTracked
      ? variant.inventoryLevels.reduce(
          (total, level) => total + level.available,
          0
        )
      : null,
    policy: variant.inventoryPolicy,
    requiresShipping: variant.requiresShipping,
    weightGrams: variant.weightGrams,
    imageUrl: variant.image?.media.url ?? fallbackImage,
    isTaxable: variant.isTaxable,
    taxCode: variant.taxCode,
  }
}
