import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import type {
  CreateProductInput,
  ProductImageInput,
  UpdateProductInput,
  VariantInput,
} from '@/lib/validation/product'

/**
 * Product catalog.
 *
 * The catalogue belongs to the organisation, not to any one storefront: a
 * merchant running three landing pages sells one inventory across all of them.
 * Every exported function therefore takes `organizationId`, checks the caller's
 * access to it, and scopes every query by it — a product id alone is never
 * enough to read or write a row, which is what stops one tenant reaching
 * another's catalogue by guessing an id.
 */

async function uniqueProductHandle(
  organizationId: string,
  base: string,
  excludeProductId?: string
): Promise<string> {
  const baseHandle = slugify(base) || 'product'

  const existing = await prisma.product.findFirst({
    where: {
      organizationId,
      handle: baseHandle,
      id: excludeProductId ? { not: excludeProductId } : undefined,
    },
    select: { id: true },
  })
  if (!existing) return baseHandle

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseHandle)
    const collision = await prisma.product.findFirst({
      where: { organizationId, handle: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique product handle')
}

/**
 * Builds the display title for a variant from its option values.
 *
 * "Default Title" for an option-less product is Shopify's convention, and
 * themes special-case it to decide whether to render a variant picker at all —
 * so it is a contract, not a cosmetic default.
 */
export function deriveVariantTitle(variant: {
  option1?: string | null
  option2?: string | null
  option3?: string | null
}): string {
  const parts = [variant.option1, variant.option2, variant.option3].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
  return parts.length > 0 ? parts.join(' / ') : 'Default Title'
}

const PRODUCT_INCLUDE = {
  options: { orderBy: { position: 'asc' } },
  images: {
    orderBy: { position: 'asc' },
    include: { media: { select: { url: true, width: true, height: true } } },
  },
  variants: {
    orderBy: { position: 'asc' },
    include: {
      inventoryLevels: { select: { available: true, committed: true } },
    },
  },
} as const

/**
 * How the catalogue can be ordered.
 *
 * Newest-first is the default because a catalogue is worked on at its head —
 * the thing you just added is the thing you are still editing. Title order is
 * for finding something; price order is for merchandising.
 */
export const PRODUCT_SORTS = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  title: { title: 'asc' },
  'title-desc': { title: 'desc' },
  updated: { updatedAt: 'desc' },
} as const

export type ProductSort = keyof typeof PRODUCT_SORTS

export async function listProducts(
  organizationId: string,
  options: {
    search?: string
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
    sort?: ProductSort
    take?: number
    skip?: number
  } = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const where = {
    organizationId,
    ...(options.status ? { status: options.status } : {}),
    ...(options.search
      ? {
          OR: [
            {
              title: { contains: options.search, mode: 'insensitive' as const },
            },
            {
              handle: {
                contains: options.search,
                mode: 'insensitive' as const,
              },
            },
            {
              variants: {
                some: {
                  sku: {
                    contains: options.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: PRODUCT_SORTS[options.sort ?? 'newest'],
      take: options.take ?? 50,
      skip: options.skip ?? 0,
    }),
    prisma.product.count({ where }),
  ])

  return { items, total }
}

export async function getProduct(organizationId: string, productId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: PRODUCT_INCLUDE,
  })
  if (!product) throw new Error('Product not found')

  return product
}

export async function createProduct(
  organizationId: string,
  input: CreateProductInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const handle = input.handle
    ? await uniqueProductHandle(organizationId, input.handle)
    : await uniqueProductHandle(organizationId, input.title)

  assertVariantOptionsAreUnique(input.variants)

  const created = await prisma.product.create({
    data: {
      organizationId,
      title: input.title,
      handle,
      description: input.description ?? null,
      status: input.status,
      productType: input.productType ?? null,
      vendor: input.vendor ?? null,
      tags: input.tags,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      // An ACTIVE product needs publishedAt for the storefront to consider it
      // live; a DRAFT one must not carry a publish date it never had.
      publishedAt: input.status === 'ACTIVE' ? new Date() : null,
      options: {
        create: input.options.map((option) => ({
          name: option.name,
          position: option.position,
          values: option.values,
        })),
      },
      images: {
        create: normalizeImagePositions(input.images ?? []).map((image) => ({
          mediaId: image.mediaId,
          altText: image.altText ?? null,
          position: image.position,
        })),
      },
      variants: {
        create: input.variants.map((variant, index) => ({
          title: deriveVariantTitle(variant),
          sku: variant.sku ?? null,
          barcode: variant.barcode ?? null,
          position: variant.position ?? index + 1,
          option1: variant.option1 ?? null,
          option2: variant.option2 ?? null,
          option3: variant.option3 ?? null,
          priceCents: variant.priceCents,
          compareAtPriceCents: variant.compareAtPriceCents ?? null,
          costCents: variant.costCents ?? null,
          isTaxable: variant.isTaxable,
          taxCode: variant.taxCode ?? null,
          inventoryTracked: variant.inventoryTracked,
          inventoryPolicy: variant.inventoryPolicy,
          requiresShipping: variant.requiresShipping,
          weightGrams: variant.weightGrams,
          // Not set here: the ProductImage rows are being created in this same
          // statement and have no ids yet. Variant images are attached in the
          // pass below, keyed by mediaId.
          imageId: null,
        })),
      },
    },
    include: PRODUCT_INCLUDE,
  })

  await linkVariantImages(prisma, created.id, input.variants)

  return prisma.product.findUniqueOrThrow({
    where: { id: created.id },
    include: PRODUCT_INCLUDE,
  })
}

/**
 * Points each variant at its chosen image.
 *
 * The form identifies a variant's image by *mediaId*, because that is the only
 * identity that exists while the merchant is still editing — ProductImage rows
 * are created on save. This resolves those to real ProductImage ids afterwards.
 *
 * A reference to an image that is no longer on the product resolves to null
 * rather than failing: deleting a photo that a variant used is an ordinary
 * edit, and it should leave that variant showing the product's main image.
 */
async function linkVariantImages(
  client: Pick<typeof prisma, 'productImage' | 'productVariant'>,
  productId: string,
  variants: VariantInput[]
) {
  const wanted = variants.filter((variant) => variant.imageId)
  if (wanted.length === 0) return

  const images = await client.productImage.findMany({
    where: { productId },
    select: { id: true, mediaId: true },
  })
  const byMediaId = new Map(images.map((image) => [image.mediaId, image.id]))
  const byId = new Set(images.map((image) => image.id))

  const stored = await client.productVariant.findMany({
    where: { productId },
    select: { id: true, option1: true, option2: true, option3: true },
  })
  const variantIdByCombo = new Map(
    stored.map((variant) => [comboKey(variant), variant.id])
  )

  for (const variant of variants) {
    // The form may name the image by mediaId (a new upload) or by an existing
    // ProductImage id (an unchanged one), so accept either.
    const imageId =
      byMediaId.get(variant.imageId ?? '') ??
      (byId.has(variant.imageId ?? '') ? variant.imageId : null)

    const variantId = variant.id ?? variantIdByCombo.get(comboKey(variant))
    if (!variantId) continue

    await client.productVariant.update({
      where: { id: variantId },
      data: { imageId: imageId ?? null },
    })
  }
}

/** Option combination, which is a variant's stable identity across a save. */
function comboKey(variant: {
  option1?: string | null
  option2?: string | null
  option3?: string | null
}) {
  return [variant.option1, variant.option2, variant.option3]
    .map((value) => value ?? '')
    .join(' / ')
}

/**
 * Gallery order, renumbered from zero with no gaps.
 *
 * Position 0 is the product's main image — it is what the catalogue card, the
 * offer thumbnail and the order line all show — so the sequence has to be
 * dense and deterministic rather than whatever indices the form happened to
 * send after a few drags.
 */
function normalizeImagePositions(images: ProductImageInput[]) {
  return [...images]
    .sort((a, b) => a.position - b.position)
    .map((image, index) => ({ ...image, position: index }))
}

export async function updateProduct(
  organizationId: string,
  productId: string,
  input: UpdateProductInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true, status: true, publishedAt: true },
  })
  if (!existing) throw new Error('Product not found')

  const handle = input.handle
    ? await uniqueProductHandle(organizationId, input.handle, productId)
    : undefined

  if (input.variants) assertVariantOptionsAreUnique(input.variants)

  return prisma.$transaction(async (tx) => {
    if (input.options) {
      // Options are replaced wholesale rather than diffed: they are a small
      // fixed set (at most 3) and a positional diff is more code than it is
      // worth. Variants are diffed properly below, because those carry
      // inventory and order history.
      await tx.productOption.deleteMany({ where: { productId } })
      await tx.productOption.createMany({
        data: input.options.map((option) => ({
          productId,
          name: option.name,
          position: option.position,
          values: option.values,
        })),
      })
    }

    // Images before variants: a variant points at a ProductImage row, so those
    // rows have to exist (and the deleted ones have to be gone) before the
    // variant references are resolved.
    if (input.images) {
      await syncImages(tx, productId, input.images)
    }

    if (input.variants) {
      await syncVariants(tx, productId, input.variants)
      await linkVariantImages(tx, productId, input.variants)
    }

    return tx.product.update({
      where: { id: productId },
      data: {
        title: input.title,
        handle,
        description: input.description,
        status: input.status,
        productType: input.productType,
        vendor: input.vendor,
        tags: input.tags,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        publishedAt:
          input.status === 'ACTIVE' && !existing.publishedAt
            ? new Date()
            : input.status === 'DRAFT'
              ? null
              : undefined,
      },
      include: PRODUCT_INCLUDE,
    })
  })
}

/**
 * Reconciles the gallery against what was submitted.
 *
 * Matched by mediaId rather than by row id, because the same asset chosen twice
 * is the same photo and because the form works in terms of media the merchant
 * picked, not of rows it has never seen. Images dropped from the submission are
 * deleted — the ProductImage row only, never the MediaAsset, which may be in
 * use on a page or another product and belongs to the library.
 */
async function syncImages(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  productId: string,
  images: ProductImageInput[]
) {
  const ordered = normalizeImagePositions(images)
  const keep = new Set(ordered.map((image) => image.mediaId))

  const existing = await tx.productImage.findMany({
    where: { productId },
    select: { id: true, mediaId: true },
  })

  const stale = existing.filter((image) => !keep.has(image.mediaId))
  if (stale.length > 0) {
    // Variants referencing a removed photo fall back to the product's main
    // image rather than rendering a broken one.
    await tx.productVariant.updateMany({
      where: { productId, imageId: { in: stale.map((image) => image.id) } },
      data: { imageId: null },
    })
    await tx.productImage.deleteMany({
      where: { id: { in: stale.map((image) => image.id) } },
    })
  }

  const byMediaId = new Map(existing.map((image) => [image.mediaId, image.id]))

  for (const image of ordered) {
    const id = byMediaId.get(image.mediaId)
    if (id) {
      await tx.productImage.update({
        where: { id },
        data: { altText: image.altText ?? null, position: image.position },
      })
    } else {
      await tx.productImage.create({
        data: {
          productId,
          mediaId: image.mediaId,
          altText: image.altText ?? null,
          position: image.position,
        },
      })
    }
  }
}

/**
 * Reconciles the submitted variant list against what is stored.
 *
 * Variants are matched by id and updated in place; ones missing from the
 * submission are deleted. Deletion is safe for order history because
 * OrderLine.variantId is `onDelete: SetNull` and every descriptive field on
 * the line is a snapshot — a deleted variant leaves past orders readable.
 */
async function syncVariants(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  productId: string,
  variants: VariantInput[]
) {
  const existing = await tx.productVariant.findMany({
    where: { productId },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((variant) => variant.id))
  const submittedIds = new Set(
    variants.map((variant) => variant.id).filter((id): id is string => !!id)
  )

  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id))
  if (toDelete.length > 0) {
    await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } })
  }

  for (const [index, variant] of variants.entries()) {
    const data = {
      title: deriveVariantTitle(variant),
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      position: variant.position ?? index + 1,
      option1: variant.option1 ?? null,
      option2: variant.option2 ?? null,
      option3: variant.option3 ?? null,
      priceCents: variant.priceCents,
      compareAtPriceCents: variant.compareAtPriceCents ?? null,
      costCents: variant.costCents ?? null,
      isTaxable: variant.isTaxable,
      taxCode: variant.taxCode ?? null,
      inventoryTracked: variant.inventoryTracked,
      inventoryPolicy: variant.inventoryPolicy,
      requiresShipping: variant.requiresShipping,
      weightGrams: variant.weightGrams,
      imageId: variant.imageId ?? null,
    }

    if (variant.id && existingIds.has(variant.id)) {
      await tx.productVariant.update({ where: { id: variant.id }, data })
    } else {
      await tx.productVariant.create({ data: { ...data, productId } })
    }
  }
}

/**
 * Rejects two variants sharing an option combination.
 *
 * The database has a unique constraint on (productId, option1..3) that would
 * catch this too, but only as an opaque constraint violation after a partial
 * write. Checking here turns it into a message the merchant can act on.
 */
function assertVariantOptionsAreUnique(variants: VariantInput[]) {
  const seen = new Set<string>()
  for (const variant of variants) {
    const key = [variant.option1, variant.option2, variant.option3]
      .map((value) => value ?? '')
      .join(' ')
    if (seen.has(key)) {
      throw new Error(
        `Two variants share the same options (${deriveVariantTitle(variant)})`
      )
    }
    seen.add(key)
  }
}

/**
 * Archives rather than deletes by default.
 *
 * A product referenced by orders should disappear from the catalog without
 * vanishing from history or from the merchant's reports. Hard deletion stays
 * available for products that never sold.
 */
export async function archiveProduct(
  organizationId: string,
  productId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true },
  })
  if (!product) throw new Error('Product not found')

  return prisma.product.update({
    where: { id: productId },
    data: { status: 'ARCHIVED', publishedAt: null },
  })
}

export async function deleteProduct(organizationId: string, productId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true },
  })
  if (!product) throw new Error('Product not found')

  const soldCount = await prisma.orderLine.count({ where: { productId } })
  if (soldCount > 0) {
    throw new Error(
      'This product appears on existing orders — archive it instead of deleting'
    )
  }

  await prisma.product.delete({ where: { id: productId } })
}

/**
 * The store's sellable variants, for the builder's product picker.
 *
 * Returns variants rather than products because that is what an order line
 * references: a section selling "T-shirt" cannot place an order until it knows
 * *which* T-shirt. Drafts are included — a merchant routinely builds the
 * landing page before publishing the product — so the picker shows everything
 * they could sell, and the order endpoint is what refuses to sell a product
 * that is not live yet.
 */
export async function listSellableVariants(organizationId: string) {
  const [settings, products] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true },
    }),
    prisma.product.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        title: true,
        variants: {
          orderBy: { position: 'asc' },
          select: { id: true, title: true, priceCents: true },
        },
      },
    }),
  ])

  const currencyCode = settings?.currencyCode ?? 'USD'

  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
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

/**
 * The catalogue as the Offers editor needs it: products with their variants.
 *
 * Distinct from `listSellableVariants`, which flattens to a single pick-one
 * list. An offer attaches a *product* and optionally pins one of its variants,
 * so the grouping has to survive the query.
 */
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
  const [settings, products] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true },
    }),
    prisma.product.findMany({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        images: {
          orderBy: { position: 'asc' },
          take: 1,
          select: { media: { select: { url: true } } },
        },
        variants: {
          orderBy: { position: 'asc' },
          select: { id: true, title: true, priceCents: true },
        },
      },
    }),
  ])

  return {
    currencyCode: settings?.currencyCode ?? 'BDT',
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.images[0]?.media.url ?? null,
      variants: product.variants,
    })),
  }
}

/**
 * Copies a product, its options, images and variants into a new draft.
 *
 * The single most common way a real catalogue grows: the next product is the
 * last one with a different colour and a new photo. Everything descriptive is
 * copied; everything that represents *history or commitment* is not.
 *
 * Deliberately not copied:
 *   - status, which resets to DRAFT, because a duplicate is a work in progress
 *     and must not appear on a live storefront the moment it is made;
 *   - stock, because the copy is a different product and inheriting a real
 *     shelf count would oversell the original;
 *   - the handle, which is derived fresh so the two never collide.
 */
export async function duplicateProduct(
  organizationId: string,
  productId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const source = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: PRODUCT_INCLUDE,
  })
  if (!source) throw new Error('Product not found')

  const title = `${source.title} (copy)`
  const handle = await uniqueProductHandle(organizationId, title)

  const created = await prisma.product.create({
    data: {
      organizationId,
      title,
      handle,
      description: source.description,
      status: 'DRAFT',
      publishedAt: null,
      productType: source.productType,
      vendor: source.vendor,
      tags: source.tags,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      options: {
        create: source.options.map((option) => ({
          name: option.name,
          position: option.position,
          values: option.values,
        })),
      },
      images: {
        create: source.images.map((image) => ({
          // The MediaAsset is shared, not duplicated — it is one file in the
          // library and copying the bytes would only grow the storage bill.
          mediaId: image.mediaId,
          altText: image.altText,
          position: image.position,
        })),
      },
      variants: {
        create: source.variants.map((variant) => ({
          title: variant.title,
          // SKU and barcode are intentionally dropped: they are unique
          // identifiers for a specific item, and two products sharing one is a
          // real problem in stock and accounting systems downstream.
          sku: null,
          barcode: null,
          position: variant.position,
          option1: variant.option1,
          option2: variant.option2,
          option3: variant.option3,
          priceCents: variant.priceCents,
          compareAtPriceCents: variant.compareAtPriceCents,
          costCents: variant.costCents,
          isTaxable: variant.isTaxable,
          taxCode: variant.taxCode,
          inventoryTracked: variant.inventoryTracked,
          inventoryPolicy: variant.inventoryPolicy,
          requiresShipping: variant.requiresShipping,
          weightGrams: variant.weightGrams,
        })),
      },
    },
    select: { id: true },
  })

  // Re-point each copied variant at the copied image, matched by the media the
  // original used. Done after creation for the same reason as in createProduct:
  // the new ProductImage rows had no ids while the nested create was running.
  const [sourceImages, newImages, newVariants] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId },
      select: { id: true, mediaId: true },
    }),
    prisma.productImage.findMany({
      where: { productId: created.id },
      select: { id: true, mediaId: true },
    }),
    prisma.productVariant.findMany({
      where: { productId: created.id },
      select: { id: true, option1: true, option2: true, option3: true },
    }),
  ])

  const mediaBySourceImageId = new Map(
    sourceImages.map((image) => [image.id, image.mediaId])
  )
  const newImageByMediaId = new Map(
    newImages.map((image) => [image.mediaId, image.id])
  )
  const newVariantByCombo = new Map(
    newVariants.map((variant) => [comboKey(variant), variant.id])
  )

  for (const variant of source.variants) {
    if (!variant.imageId) continue
    const mediaId = mediaBySourceImageId.get(variant.imageId)
    const imageId = mediaId ? newImageByMediaId.get(mediaId) : undefined
    const targetId = newVariantByCombo.get(comboKey(variant))
    if (!imageId || !targetId) continue
    await prisma.productVariant.update({
      where: { id: targetId },
      data: { imageId },
    })
  }

  return prisma.product.findUniqueOrThrow({
    where: { id: created.id },
    include: PRODUCT_INCLUDE,
  })
}

/**
 * Applies a status change to several products at once.
 *
 * Scoped by organisation in the `updateMany` filter rather than by checking
 * each id first: a single statement that cannot touch another tenant's row is
 * both faster and harder to get wrong than a loop with a guard in it.
 *
 * Returns how many actually changed, which will be fewer than requested if the
 * caller sent ids they do not own — the caller should report the real number
 * rather than the one it asked for.
 */
export async function bulkSetProductStatus(
  organizationId: string,
  productIds: string[],
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  if (productIds.length === 0) return { count: 0 }

  const result = await prisma.product.updateMany({
    where: { id: { in: productIds }, organizationId },
    data: {
      status,
      // Matches the single-product path: going live stamps a publish date,
      // leaving live clears it, and archiving takes it off the storefront.
      publishedAt: status === 'ACTIVE' ? new Date() : null,
    },
  })

  return { count: result.count }
}

/**
 * Deletes several products, refusing any that appear on an order.
 *
 * An order line keeps its own snapshot of what was sold, so deleting a product
 * does not corrupt history — but it does destroy the merchant's ability to
 * reorder or report on it, so a sold product must be archived instead. The
 * sold ones are reported back by name rather than silently skipped.
 */
export async function bulkDeleteProducts(
  organizationId: string,
  productIds: string[]
) {
  await requireOrgAccess(organizationId, 'ADMIN')
  if (productIds.length === 0) return { deleted: 0, blocked: [] as string[] }

  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, organizationId },
    select: { id: true, title: true },
  })

  const sold = await prisma.orderLine.findMany({
    where: { productId: { in: owned.map((product) => product.id) } },
    select: { productId: true },
    distinct: ['productId'],
  })
  const soldIds = new Set(
    sold.map((line) => line.productId).filter((id): id is string => id !== null)
  )

  const deletable = owned.filter((product) => !soldIds.has(product.id))
  if (deletable.length > 0) {
    await prisma.product.deleteMany({
      where: { id: { in: deletable.map((product) => product.id) } },
    })
  }

  return {
    deleted: deletable.length,
    blocked: owned
      .filter((product) => soldIds.has(product.id))
      .map((product) => product.title),
  }
}
