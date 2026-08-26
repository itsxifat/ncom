import 'server-only'
import { prisma } from '@/server/db/client'

/**
 * The catalogue and storefronts a discount can be aimed at.
 *
 * Sizes are flattened to one list with the product name on each, because the
 * question the merchant is answering — "which sizes are excluded" — is about
 * sizes, not about the products they belong to, and a nested picker makes them
 * open four products to tick four rows.
 */
export async function loadDiscountTargets(organizationId: string) {
  const [products, stores] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId },
      orderBy: { title: 'asc' },
      take: 500,
      select: {
        id: true,
        title: true,
        variants: {
          orderBy: { position: 'asc' },
          select: { id: true, title: true },
        },
      },
    }),
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
    // A single-variant product has one row called "Default Title", which is a
    // database detail rather than a size and only clutters the list.
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
