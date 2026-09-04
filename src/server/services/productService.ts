import 'server-only'
import { requireOrgAccess } from '@/server/auth/rbac'
import { prisma } from '@/server/db/client'
import {
  getProduct as readProduct,
  getProductsByIds,
  listProducts as readProducts,
  searchProducts,
  isSellable,
  type ProductPage,
  type RemoteProduct,
} from '@/server/catalog'

/**
 * The product catalogue, which is not here.
 *
 * Every function in this file used to run a query against Product,
 * ProductVariant and ProductImage in NCOM's own database, filled by merchants
 * importing their catalogue through /api/v1/products. Nothing writes those
 * tables any more and nothing reads them: a workspace's products live on the
 * merchant's own website, and this module is the read-only window onto them
 * that the dashboard, the offer editor and the page builder all look through.
 *
 * What that means for anyone working here:
 *
 *   - There are no create, update, delete or archive functions, and adding one
 *     would be a bug rather than a feature. Products are edited where they are
 *     kept, which is the merchant's own admin.
 *   - Every call is a request to somebody else's server and can fail. Callers
 *     handle CatalogError; a screen that assumes success will show a stack
 *     trace to a merchant whose host is having a bad afternoon.
 *   - Sorting and filtering are only as good as the connector's. Where a site
 *     cannot search, the fallback filters one page here — see searchProducts —
 *     and that is a deliberate degradation, not a bug to fix by copying the
 *     catalogue back into this database.
 */

/**
 * Sorts the dashboard offers.
 *
 * A remote catalogue cannot be ordered by a column NCOM does not hold, so this
 * is applied to the page that came back rather than pushed into a query. Title
 * order is the only one that is meaningful without reading the whole
 * catalogue, and it is the default for that reason.
 */
export const PRODUCT_SORTS = {
  title: 'title',
  'title-desc': 'title-desc',
} as const

export type ProductSort = keyof typeof PRODUCT_SORTS

export interface ProductListOptions {
  search?: string
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  categoryId?: string | null
  sort?: ProductSort
  take?: number
  cursor?: string | null
}

export interface ProductList {
  items: RemoteProduct[]
  /** Opaque; hand back to fetch the next page. Null when there are no more. */
  nextCursor: string | null
  /** What the site reported, when it counts. Null means it does not. */
  total: number | null
}

export async function listProducts(
  organizationId: string,
  options: ProductListOptions = {}
): Promise<ProductList> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const take = Math.min(Math.max(options.take ?? 24, 1), 100)

  const page: ProductPage = options.search
    ? {
        products: await searchProducts(organizationId, options.search, {
          limit: take,
          includeDrafts: true,
        }),
        nextCursor: null,
        total: null,
      }
    : await readProducts(organizationId, {
        limit: take,
        cursor: options.cursor,
        categoryId: options.categoryId,
        includeDrafts: true,
      })

  let items = page.products
  if (options.status) {
    items = items.filter((product) => product.status === options.status)
  }

  if (options.sort === 'title-desc') {
    items = [...items].sort((a, b) => b.title.localeCompare(a.title))
  } else if (options.sort === 'title') {
    items = [...items].sort((a, b) => a.title.localeCompare(b.title))
  }

  return { items, nextCursor: page.nextCursor, total: page.total }
}

export async function getProduct(
  organizationId: string,
  productId: string
): Promise<RemoteProduct | null> {
  await requireOrgAccess(organizationId, 'VIEWER')
  return readProduct(organizationId, productId)
}

/** Products by id, for rehydrating saved references in the dashboard. */
export async function getProducts(
  organizationId: string,
  ids: string[]
): Promise<Map<string, RemoteProduct>> {
  await requireOrgAccess(organizationId, 'VIEWER')
  return getProductsByIds(organizationId, ids)
}

/**
 * A variant's display title, derived from its option values.
 *
 * Kept because two screens still label a variant this way and a connector may
 * send option values without a title.
 */
export function deriveVariantTitle(variant: {
  title?: string | null
  options?: string[]
}): string {
  if (variant.title && variant.title.trim()) return variant.title.trim()
  const options = (variant.options ?? []).filter(Boolean)
  return options.length > 0 ? options.join(' / ') : 'Default Title'
}

// ── Pickers ──────────────────────────────────────────────────────────────

/**
 * The catalogue as every product picker needs it.
 *
 * There is one of these rather than one shape per caller because "choose a
 * product" appears in the offers panel, the page builder's inspector, the
 * discount editor and the order editor, and each had grown its own query
 * returning a different subset — so the same list showed a price in one place,
 * a bare title in another, and no stock anywhere. A merchant choosing between
 * two similar products needs the photo, the price and whether it is in stock in
 * all of them.
 *
 * Drafts are included on purpose: building the page before publishing the
 * product is the normal order of work. Archived ones are not — they are not for
 * sale, and offering them is offering a mistake.
 */
export interface PickerProduct {
  id: string
  title: string
  handle: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  imageUrl: string | null
  categoryName: string | null
  minPriceCents: number
  maxPriceCents: number
  available: number
  /**
   * False when the merchant's site does not count this product's stock, so the
   * row says "not tracked" rather than "0". A site that does not count is not a
   * shop with an empty shelf, and every picker in the dashboard reads this flag
   * before it believes the number beside it.
   */
  tracksInventory: boolean
  variants: {
    id: string
    /** Saved alongside the variant id, so a reference resolves in one call. */
    productId: string
    title: string
    sku: string | null
    priceCents: number
    available: number
    tracksInventory: boolean
    sellable: boolean
  }[]
}

export async function listPickerProducts(
  organizationId: string,
  options: { search?: string; take?: number; includeArchived?: boolean } = {}
): Promise<{
  products: PickerProduct[]
  currencyCode: string
  total: number
}> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const take = Math.min(options.take ?? 60, 200)

  const [currencyCode, found] = await Promise.all([
    organizationCurrency(organizationId),
    searchProducts(organizationId, options.search ?? '', {
      limit: take,
      includeDrafts: true,
    }),
  ])

  const products = found
    .filter(
      (product) => options.includeArchived || product.status !== 'ARCHIVED'
    )
    .map(toPickerProduct)

  return { products, currencyCode, total: products.length }
}

function toPickerProduct(product: RemoteProduct): PickerProduct {
  const prices = product.variants.map((variant) => variant.priceCents)
  const counted = product.variants
    .map((variant) => variant.available)
    .filter((value): value is number => value !== null)

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    imageUrl: product.images[0]?.url ?? null,
    categoryName: null,
    minPriceCents: prices.length > 0 ? Math.min(...prices) : 0,
    maxPriceCents: prices.length > 0 ? Math.max(...prices) : 0,
    available: counted.reduce((sum, value) => sum + value, 0),
    tracksInventory: counted.length > 0,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      productId: product.id,
      title: variant.title,
      sku: variant.sku,
      priceCents: variant.priceCents,
      available: variant.available ?? 0,
      tracksInventory: variant.available !== null,
      sellable: isSellable({
        available: variant.available,
        policy: variant.policy,
      }),
    })),
  }
}

/** The flat "pick one variant" list the builder's inspector renders. */
export async function listSellableVariants(organizationId: string): Promise<
  {
    variantId: string
    productId: string
    label: string
    priceCents: number
    currencyCode: string
  }[]
> {
  const [currencyCode, page] = await Promise.all([
    organizationCurrency(organizationId),
    readProducts(organizationId, { limit: 100, includeDrafts: true }),
  ])

  return page.products.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
      productId: product.id,
      // A single-variant product has a placeholder variant title, which would
      // read as "Shirt — Default Title" in the picker.
      label:
        product.variants.length > 1
          ? `${product.title} — ${variant.title}`
          : product.title,
      priceCents: variant.priceCents,
      currencyCode,
    }))
  )
}

export interface OfferProduct {
  id: string
  title: string
  imageUrl: string | null
  variants: { id: string; title: string; priceCents: number }[]
}

export async function listOfferProducts(organizationId: string): Promise<{
  products: OfferProduct[]
  currencyCode: string
}> {
  const [currencyCode, page] = await Promise.all([
    organizationCurrency(organizationId),
    readProducts(organizationId, { limit: 100 }),
  ])

  return {
    currencyCode,
    products: page.products.map((product) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.images[0]?.url ?? null,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        title: variant.title,
        priceCents: variant.priceCents,
      })),
    })),
  }
}

async function organizationCurrency(organizationId: string): Promise<string> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencyCode: true },
  })
  return settings?.currencyCode ?? 'BDT'
}
