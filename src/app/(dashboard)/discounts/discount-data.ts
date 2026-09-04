import 'server-only'
import { prisma } from '@/server/db/client'
import {
  listCategories,
  searchProducts,
  isCatalogError,
  type CatalogCategory,
  type CatalogProduct,
} from '@/server/catalog'

/**
 * The catalogue and storefronts a discount can be aimed at.
 *
 * Read from the merchant's own website, which changes two things about the old
 * version worth knowing.
 *
 * The first is the ceiling. This used to select every product in the workspace;
 * now it reads one page from their connector, because "give me all 40,000
 * products so someone can tick three" is a request to a merchant's own server
 * and not one to make on the strength of a dropdown. A merchant whose targets
 * are not in the list can still save the discount — the ids are stored as typed
 * strings and matched at pricing time — they simply cannot pick them here.
 *
 * The second is what a "collection" is. There is no Collection table any more:
 * scoped discounts match against whatever groups the connector files a product
 * under, which is its categories. So the collection picker shows their tree.
 *
 * Sizes are flattened to one list with the product name on each, because the
 * question the merchant is answering — "which sizes are excluded" — is about
 * sizes, not about the products they belong to, and a nested picker makes them
 * open four products to tick four rows.
 */
export async function loadDiscountTargets(organizationId: string) {
  const [products, categories, stores] = await Promise.all([
    searchProducts(organizationId, '', {
      limit: 200,
      includeDrafts: true,
    }).catch(emptyOnCatalogFailure<CatalogProduct>),
    listCategories(organizationId).catch(
      emptyOnCatalogFailure<CatalogCategory>
    ),
    prisma.store.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return {
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
    })),
    collections: categories.map((category) => ({
      id: category.id,
      title: category.name,
    })),
    // A single-variant product has one row called "Default Title", which is a
    // detail of how variants are modelled rather than a size, and only clutters
    // the list.
    variants: products.flatMap((product) =>
      product.variants
        .filter(
          (variant) =>
            product.variants.length > 1 || variant.title !== 'Default Title'
        )
        .map((variant) => ({
          id: variant.id,
          productTitle: product.title,
          title: variant.title,
        }))
    ),
    stores,
  }
}

/**
 * A discount form that cannot reach the catalogue is still a usable form.
 *
 * The pickers come up empty and the merchant can still set a percentage, a
 * code, a schedule and a spend threshold — which is most of what a discount is.
 * Failing the whole screen because an optional picker could not be filled would
 * be the worse trade.
 */
function emptyOnCatalogFailure<T>(error: unknown): T[] {
  if (isCatalogError(error)) return []
  throw error
}
