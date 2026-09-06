import 'server-only'
import { prisma } from '@/server/db/client'
import {
  listCategories,
  resolveVariants,
  isCatalogError,
  type CatalogCategory,
} from '@/server/catalog'
import {
  getPickerProducts,
  listPickerProducts,
  type PickerProduct,
} from '@/server/services/productService'

/**
 * The catalogue and storefronts a discount can be aimed at.
 *
 * Read from the merchant's own website, which changes two things about the old
 * version worth knowing.
 *
 * The first is how much of it arrives at once. This sends the first page and
 * the cursor after it; the picker fetches the rest as the merchant scrolls.
 * Asking for the whole catalogue up front — "give me all 40,000 products so
 * someone can tick three" — is a request to a merchant's own server and not one
 * to make on the strength of a dropdown, and the version that asked for one
 * fixed page instead simply hid every product past it.
 *
 * The second is what a "collection" is. There is no Collection table any more:
 * scoped discounts match against whatever groups the connector files a product
 * under, which is its categories. So the collection picker shows their tree.
 *
 * Whatever the discount already targets is fetched by id and folded into the
 * same list, so an existing rule reads back as products and sizes rather than
 * as a row of ids that happen to be off the first page.
 */
export async function loadDiscountTargets(
  organizationId: string,
  selected: { productIds?: string[]; variantIds?: string[] } = {}
): Promise<{
  products: PickerProduct[]
  productsCursor: string | null
  productsTotal: number | null
  collections: { id: string; title: string }[]
  stores: { id: string; name: string }[]
}> {
  const [picker, chosen, sized, categories, stores] = await Promise.all([
    listPickerProducts(organizationId, { take: 60 }).catch(
      emptyPageOnCatalogFailure
    ),
    getPickerProducts(organizationId, selected.productIds ?? []).catch(
      emptyOnCatalogFailure<PickerProduct>
    ),
    productsOwningVariants(organizationId, selected.variantIds ?? []).catch(
      emptyOnCatalogFailure<PickerProduct>
    ),
    listCategories(organizationId).catch(
      emptyOnCatalogFailure<CatalogCategory>
    ),
    prisma.store.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const seen = new Set(picker.products.map((product) => product.id))
  const referenced = [...chosen, ...sized].filter((product) => {
    if (seen.has(product.id)) return false
    seen.add(product.id)
    return true
  })

  return {
    products: [...picker.products, ...referenced],
    productsCursor: picker.nextCursor,
    productsTotal: picker.total,
    collections: categories.map((category) => ({
      id: category.id,
      title: category.name,
    })),
    stores,
  }
}

/**
 * The products behind a set of saved size ids.
 *
 * A size-level rule stores variant ids alone, so the only way to show it as
 * "Classic Tee · Large" rather than as a hex string is to ask the catalogue
 * which products those variants belong to and seed the picker with them.
 */
async function productsOwningVariants(
  organizationId: string,
  variantIds: string[]
): Promise<PickerProduct[]> {
  if (variantIds.length === 0) return []

  const resolved = await resolveVariants(
    organizationId,
    variantIds.map((variantId) => ({ variantId }))
  )

  const productIds = [
    ...new Set([...resolved.values()].map((entry) => entry.product.id)),
  ]

  return getPickerProducts(organizationId, productIds)
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

function emptyPageOnCatalogFailure(error: unknown): {
  products: PickerProduct[]
  nextCursor: string | null
  total: number | null
} {
  if (isCatalogError(error))
    return { products: [], nextCursor: null, total: null }
  throw error
}
