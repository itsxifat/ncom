import 'server-only'
import { prisma } from '@/server/db/client'
import { hasCatalogSource, listProducts } from '@/server/catalog'
import {
  getStoreListing,
  getStoreProduct,
  loadStoreCatalogue,
  runProductQuery,
  sectionProductQuery,
} from '@/server/services/storefrontService'
import {
  productQueryKey,
  type StoreProductCard,
  type StorefrontContext,
} from '@/modules/sections/storefront'
import {
  SAMPLE_CATEGORIES,
  sampleCardsFor,
  sampleListing,
  sampleProductDetail,
} from '@/modules/storefront/sample'

/**
 * The shop around a page being edited or previewed in the dashboard.
 *
 * The real catalogue when there is one — a merchant designing their product
 * page should see their own product in it — and the samples when the
 * workspace has no products at all, so a brand new store is designed around
 * something rather than around empty boxes. Links point at the live store, for
 * the preview; the canvas never follows them anyway.
 */
export async function builderStorefront(input: {
  organizationId: string
  storeName: string
  liveUrl: string
  role: 'STANDARD' | 'PRODUCT' | 'CATALOG' | 'LAYOUT'
  sections: { id: string; type: string; content: unknown }[]
}): Promise<{
  storefront: StorefrontContext
  /** Answers to the page's product questions, keyed by query. */
  products: Record<string, StoreProductCard[]>
}> {
  const { organizationId } = input
  const [catalogue, localCount, connected] = await Promise.all([
    loadStoreCatalogue(organizationId),
    prisma.product.count({ where: { organizationId, status: 'ACTIVE' } }),
    hasCatalogSource(organizationId),
  ])
  const sample = localCount === 0 && !connected
  const currencyCode = catalogue.currencyCode

  const queries = input.sections.flatMap((section) => {
    const query = sectionProductQuery(section)
    return query ? [query] : []
  })

  let product = null
  if (input.role === 'PRODUCT') {
    if (!sample) {
      const first = await listProducts(organizationId, { limit: 1 }).catch(
        () => null
      )
      const handle = first?.products[0]?.handle
      product = handle
        ? await getStoreProduct(organizationId, handle).catch(() => null)
        : null
    }
    product ??= sampleProductDetail(currencyCode)
  }

  const products: Record<string, StoreProductCard[]> = {}
  if (sample) {
    for (const query of queries) {
      products[productQueryKey(query)] = sampleCardsFor(
        query.limit,
        currencyCode,
        query.source === 'related' ? 'sample-tee' : undefined
      )
    }
  } else {
    await Promise.all(
      queries.map(async (query) => {
        products[productQueryKey(query)] = await runProductQuery(
          organizationId,
          query,
          product
        ).catch(() => [])
      })
    )
  }

  let listing = null
  if (input.role === 'CATALOG') {
    listing = sample
      ? sampleListing(currencyCode)
      : await getStoreListing(organizationId, { kind: 'all' }, catalogue).catch(
          () => null
        )
    if (!listing || listing.products.length === 0) {
      listing = sampleListing(currencyCode)
    }
  }

  return {
    storefront: {
      storeName: input.storeName,
      currencyCode,
      linkBase: input.liveUrl,
      categories:
        catalogue.categories.length > 0 || !sample
          ? catalogue.categories
          : SAMPLE_CATEGORIES,
      collections: catalogue.collections,
      sectionProducts: {},
      product,
      listing,
      accountsEnabled: catalogue.accountsEnabled,
      catalogUnavailable: !catalogue.catalogueAvailable,
      sample,
    },
    products,
  }
}
