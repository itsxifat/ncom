import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { emitWebhook } from '@/server/services/webhookService'
import { importMediaFromUrl } from '@/server/services/mediaService'
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
  category: {
    select: { id: true, name: true, handle: true, level: true, parentId: true },
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
    /**
     * Usually a category and its descendants — see categoryService.descendantIds.
     * A department page means "everything under here", not "the handful filed
     * directly against the department itself".
     */
    categoryIds?: string[]
    /** Products with no category at all, for finding the ones nobody filed. */
    uncategorized?: boolean
    /**
     * Only products touched since this moment.
     *
     * What makes incremental sync possible. Without it the only way to find
     * recent changes is to page the entire catalogue and diff locally, which is
     * wasteful at 400 products, unworkable at 40,000, and spends a read budget
     * on rows that did not change.
     */
    updatedSince?: Date
    /** Only products first created since this moment. */
    createdSince?: Date
    sort?: ProductSort
    take?: number
    skip?: number
  } = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const search = options.search?.trim()

  const where = {
    organizationId,
    ...(options.status ? { status: options.status } : {}),
    ...(options.updatedSince
      ? { updatedAt: { gte: options.updatedSince } }
      : {}),
    ...(options.createdSince
      ? { createdAt: { gte: options.createdSince } }
      : {}),
    ...(options.uncategorized
      ? { categoryId: null }
      : options.categoryIds && options.categoryIds.length > 0
        ? { categoryId: { in: options.categoryIds } }
        : {}),
    ...(search
      ? {
          OR: [
            {
              title: { contains: search, mode: 'insensitive' as const },
            },
            {
              handle: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            { vendor: { contains: search, mode: 'insensitive' as const } },
            {
              productType: { contains: search, mode: 'insensitive' as const },
            },
            // Tags are an exact-match array contains rather than a substring —
            // "sale" should not match "wholesale", and a tag is a chosen label.
            { tags: { has: search.toLowerCase() } },
            {
              variants: {
                some: {
                  OR: [
                    {
                      sku: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                    // Barcodes are what a scanner types into the search box.
                    {
                      barcode: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
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

  if (input.categoryId) {
    await assertCategoryBelongsToOrg(organizationId, input.categoryId)
  }

  // Resolved up front so a bad image id or an unreachable URL fails before any
  // rows exist, rather than leaving a half-made product behind.
  const images = await resolveProductImages(organizationId, input.images ?? [])

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
      categoryId: input.categoryId ?? null,
      externalId: input.externalId ?? null,
      externalSource: input.externalSource ?? null,
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
        create: normalizeImagePositions(images).map((image) => ({
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

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
    include: PRODUCT_INCLUDE,
  })

  await emitWebhook(organizationId, 'PRODUCT_CREATED', productPayload(product))

  return product
}

/**
 * Refuses a category id belonging to someone else.
 *
 * Prisma would accept the write — `categoryId` is just a column — and the row
 * would then be filed under a category the organisation cannot see, invisible
 * in its own tree and quietly leaking a foreign id through the API.
 */
async function assertCategoryBelongsToOrg(
  organizationId: string,
  categoryId: string
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  })
  if (!category) throw new Error('Category not found')
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

/** A gallery entry once every `src` has become a real asset in the library. */
type ResolvedProductImage = ProductImageInput & { mediaId: string }

/**
 * Turns whatever the caller sent for the gallery into real MediaAsset ids.
 *
 * Two jobs, both of which used to be missing:
 *
 * A `src` URL is fetched into the library. Without this an API client could not
 * set a product image at all — `mediaId` was required and nothing outside the
 * dashboard could mint one — so every imported catalogue arrived with no
 * photographs.
 *
 * A `mediaId` is checked for existence and ownership *before* the write. An
 * unknown id used to reach the database and fail as a foreign-key violation,
 * which surfaced to the caller as a 500 telling them to retry something that
 * could never succeed. It is ordinary bad input and now says so, naming the
 * position in the array that is wrong.
 *
 * Runs before the transaction, deliberately: fetching a dozen images over the
 * network inside an open transaction would hold row locks for the length of
 * someone else's CDN.
 */
async function resolveProductImages(
  organizationId: string,
  images: ProductImageInput[]
): Promise<ResolvedProductImage[]> {
  if (images.length === 0) return []

  const declaredIds = images
    .map((image) => image.mediaId)
    .filter((id): id is string => Boolean(id))

  const owned = new Set(
    declaredIds.length === 0
      ? []
      : (
          await prisma.mediaAsset.findMany({
            where: { id: { in: declaredIds }, organizationId },
            select: { id: true },
          })
        ).map((asset) => asset.id)
  )

  const resolved: ResolvedProductImage[] = []

  for (const [index, image] of images.entries()) {
    if (image.mediaId) {
      if (!owned.has(image.mediaId)) {
        throw new Error(
          `images.${index}.mediaId: no image with id "${image.mediaId}" in this workspace`
        )
      }
      resolved.push({ ...image, mediaId: image.mediaId })
      continue
    }

    if (!image.src) {
      throw new Error(`images.${index}: give either mediaId or src`)
    }

    const { asset } = await importMediaFromUrl(organizationId, image.src, {
      altText: image.altText ?? undefined,
    })
    resolved.push({ ...image, mediaId: asset.id })
  }

  return resolved
}

/**
 * Gallery order, renumbered from zero with no gaps.
 *
 * Position 0 is the product's main image — it is what the catalogue card, the
 * offer thumbnail and the order line all show — so the sequence has to be
 * dense and deterministic rather than whatever indices the form happened to
 * send after a few drags.
 */
function normalizeImagePositions(images: ResolvedProductImage[]) {
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
  if (input.categoryId) {
    await assertCategoryBelongsToOrg(organizationId, input.categoryId)
  }

  const images = input.images
    ? await resolveProductImages(organizationId, input.images)
    : undefined

  const updated = await prisma.$transaction(async (tx) => {
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
    if (images) {
      await syncImages(tx, productId, images)
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
        // Explicit null is "remove it from its category", which is different
        // from `undefined` meaning "the form did not mention categories".
        categoryId: input.categoryId,
        externalId: input.externalId,
        externalSource: input.externalSource,
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

  await emitWebhook(organizationId, 'PRODUCT_UPDATED', productPayload(updated))

  return updated
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
  images: ResolvedProductImage[]
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

  const archived = await prisma.product.update({
    where: { id: productId },
    data: { status: 'ARCHIVED', publishedAt: null },
    include: PRODUCT_INCLUDE,
  })

  // Archiving is an update, not a deletion: the product still exists, it has
  // simply left the storefront, and a receiver that treats it as deleted would
  // lose the row it needs when the merchant un-archives it.
  await emitWebhook(organizationId, 'PRODUCT_UPDATED', productPayload(archived))

  return archived
}

export async function deleteProduct(organizationId: string, productId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true, title: true, handle: true, externalId: true },
  })
  if (!product) throw new Error('Product not found')

  const soldCount = await prisma.orderLine.count({ where: { productId } })
  if (soldCount > 0) {
    throw new Error(
      'This product appears on existing orders — archive it instead of deleting'
    )
  }

  await prisma.product.delete({ where: { id: productId } })

  await emitWebhook(organizationId, 'PRODUCT_DELETED', {
    id: product.id,
    title: product.title,
    handle: product.handle,
    externalId: product.externalId,
  })
}

/**
 * The public shape of a product: what the REST API returns and what a webhook
 * carries.
 *
 * One function for both so an integration that reads `GET /products/{id}` and
 * one that listens for `product.updated` are looking at the same object. Two
 * hand-written shapes drift, and the drift shows up as a receiver that works
 * until the day it is fed a webhook instead of a poll.
 */
export function productPayload(product: {
  id: string
  title: string
  handle: string
  description: string | null
  status: string
  productType: string | null
  vendor: string | null
  tags: string[]
  externalId?: string | null
  seoTitle: string | null
  seoDescription: string | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  category?: {
    id: string
    name: string
    handle: string
    level: number
    parentId: string | null
  } | null
  options?: { name: string; position: number; values: string[] }[]
  images?: {
    id: string
    altText: string | null
    position: number
    media: { url: string }
  }[]
  variants?: {
    id: string
    title: string
    sku: string | null
    barcode: string | null
    position: number
    option1: string | null
    option2: string | null
    option3: string | null
    priceCents: number
    compareAtPriceCents: number | null
    inventoryTracked: boolean
    inventoryPolicy: string
    requiresShipping: boolean
    weightGrams: number
    inventoryLevels?: { available: number; committed: number }[]
  }[]
}) {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    status: product.status.toLowerCase(),
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    externalId: product.externalId ?? null,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          handle: product.category.handle,
          level: product.category.level,
          parentId: product.category.parentId,
        }
      : null,
    seo: {
      title: product.seoTitle,
      description: product.seoDescription,
    },
    options:
      product.options?.map((option) => ({
        name: option.name,
        position: option.position,
        values: option.values,
      })) ?? [],
    images:
      product.images?.map((image) => ({
        id: image.id,
        url: image.media.url,
        altText: image.altText,
        position: image.position,
      })) ?? [],
    variants:
      product.variants?.map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        barcode: variant.barcode,
        position: variant.position,
        options: [variant.option1, variant.option2, variant.option3].filter(
          (value): value is string => typeof value === 'string'
        ),
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        inventoryTracked: variant.inventoryTracked,
        inventoryPolicy: variant.inventoryPolicy.toLowerCase(),
        requiresShipping: variant.requiresShipping,
        weightGrams: variant.weightGrams,
        // Summed across locations: an integration syncing stock wants one
        // sellable number, and per-location detail is on the inventory endpoint
        // for the few that need it.
        available:
          variant.inventoryLevels?.reduce(
            (sum, level) => sum + level.available,
            0
          ) ?? 0,
        committed:
          variant.inventoryLevels?.reduce(
            (sum, level) => sum + level.committed,
            0
          ) ?? 0,
      })) ?? [],
    publishedAt: product.publishedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
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
 * The catalogue as every product picker needs it.
 *
 * There is one of these rather than one shape per caller because "choose a
 * product" appears in the collection editor, the offers panel, the page
 * builder's inspector and the bulk-file bar, and each had grown its own
 * query returning a different subset — so the same list showed a price in one
 * place, a bare title in another, and no stock anywhere. A merchant choosing
 * between two similar products needs the photo, the price and whether it is in
 * stock in all four.
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
  /** False when no variant tracks stock, so the row says "not tracked", not "0". */
  tracksInventory: boolean
  variants: {
    id: string
    title: string
    sku: string | null
    priceCents: number
    available: number
    tracksInventory: boolean
  }[]
}

export async function listPickerProducts(
  organizationId: string,
  options: { search?: string; take?: number; includeArchived?: boolean } = {}
): Promise<{ products: PickerProduct[]; currencyCode: string; total: number }> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const search = options.search?.trim()
  const take = Math.min(options.take ?? 60, 200)

  const where = {
    organizationId,
    ...(options.includeArchived
      ? {}
      : { status: { not: 'ARCHIVED' as const } }),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { handle: { contains: search, mode: 'insensitive' as const } },
            { vendor: { contains: search, mode: 'insensitive' as const } },
            {
              variants: {
                some: {
                  OR: [
                    { sku: { contains: search, mode: 'insensitive' as const } },
                    {
                      barcode: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  }

  const [settings, products, total] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true },
    }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        handle: true,
        status: true,
        category: { select: { name: true } },
        images: {
          orderBy: { position: 'asc' },
          take: 1,
          select: { media: { select: { url: true } } },
        },
        variants: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            sku: true,
            priceCents: true,
            inventoryTracked: true,
            inventoryLevels: { select: { available: true } },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ])

  return {
    currencyCode: settings?.currencyCode ?? 'USD',
    total,
    products: products.map((product) => {
      const variants = product.variants.map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        priceCents: variant.priceCents,
        tracksInventory: variant.inventoryTracked,
        available: variant.inventoryTracked
          ? variant.inventoryLevels.reduce(
              (sum, level) => sum + level.available,
              0
            )
          : 0,
      }))

      const prices = variants.map((variant) => variant.priceCents)

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        imageUrl: product.images[0]?.media.url ?? null,
        categoryName: product.category?.name ?? null,
        minPriceCents: prices.length > 0 ? Math.min(...prices) : 0,
        maxPriceCents: prices.length > 0 ? Math.max(...prices) : 0,
        tracksInventory: variants.some((variant) => variant.tracksInventory),
        available: variants
          .filter((variant) => variant.tracksInventory)
          .reduce((sum, variant) => sum + variant.available, 0),
        variants,
      }
    }),
  }
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
 * Creates or updates a product keyed on the merchant's own id.
 *
 * This is what makes importing an existing catalogue safe to run more than
 * once. An importer that only creates turns three interrupted runs into three
 * copies of every product; one that matches on title breaks the moment two
 * products are called "Classic Tee" or someone fixes a typo. Matching on
 * `externalId` — the id the product already has in the system it came from —
 * is the only key that survives both.
 *
 * Products that exist here but not upstream are left alone. A partial import
 * (one page of a paginated feed, a single-product retry) must not read as
 * "everything else was deleted".
 */
export async function upsertProductByExternalId(
  organizationId: string,
  input: CreateProductInput & { externalId: string }
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.product.findFirst({
    where: { organizationId, externalId: input.externalId },
    select: { id: true },
  })

  if (!existing) {
    const created = await createProduct(organizationId, input)
    return { product: created, created: true }
  }

  const updated = await updateProduct(organizationId, existing.id, input)
  return { product: updated, created: false }
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
