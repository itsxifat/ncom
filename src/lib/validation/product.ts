import { z } from 'zod'

/**
 * Product and variant input.
 *
 * Prices arrive as integers in minor units — the form layer converts what the
 * merchant typed ("12.99") via parseMoneyInput before validation, so nothing
 * downstream of here ever sees a decimal price. See lib/money.ts.
 */

const priceCents = z
  .number()
  .int('Price must be a whole number of cents')
  .min(0, 'Price cannot be negative')
  // Guards against a mis-parsed input becoming a nine-figure price; the ceiling
  // is well above any legitimate single-item price in minor units.
  .max(1_000_000_000)

export const productOptionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  position: z.number().int().min(1).max(3),
  values: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
})

export const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  priceCents,
  compareAtPriceCents: priceCents.optional().nullable(),
  costCents: priceCents.optional().nullable(),
  option1: z.string().trim().max(80).optional().nullable(),
  option2: z.string().trim().max(80).optional().nullable(),
  option3: z.string().trim().max(80).optional().nullable(),
  isTaxable: z.boolean().default(true),
  taxCode: z.string().trim().max(40).optional().nullable(),
  inventoryTracked: z.boolean().default(true),
  inventoryPolicy: z.enum(['DENY', 'CONTINUE']).default('DENY'),
  requiresShipping: z.boolean().default(true),
  weightGrams: z.number().int().min(0).max(10_000_000).default(0),
  imageId: z.string().optional().nullable(),
  position: z.number().int().min(1).default(1),
})

export type VariantInput = z.infer<typeof variantSchema>

/**
 * One image on a product.
 *
 * References a MediaAsset the organisation already owns rather than carrying a
 * URL: the asset is what has an owner, a size and a storage key, and letting a
 * product point at an arbitrary URL would put images on a merchant's storefront
 * that nobody can find, replace or delete afterwards.
 *
 * `position` is the gallery order and position 0 is the one used everywhere a
 * single image is needed — the product card, the offer thumbnail, the order
 * line. Reordering is therefore a merchandising decision, not a cosmetic one.
 */
export const productImageSchema = z.object({
  id: z.string().optional(),
  mediaId: z.string().min(1),
  altText: z.string().trim().max(300).optional().nullable(),
  position: z.number().int().min(0).max(250).default(0),
})

export type ProductImageInput = z.infer<typeof productImageSchema>

export const createProductSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens')
    .max(80)
    .optional(),
  description: z.string().max(50_000).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  productType: z.string().trim().max(80).optional(),
  vendor: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  // Nullable rather than merely optional: clearing a product's category is a
  // real edit, and `undefined` has to keep meaning "leave it alone" so a
  // partial update from the API cannot silently unfile a product.
  categoryId: z.string().min(1).nullable().optional(),
  /** The id this product has in the merchant's own system. Makes imports idempotent. */
  externalId: z.string().trim().max(200).nullable().optional(),
  externalSource: z.string().trim().max(80).nullable().optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  options: z.array(productOptionSchema).max(3).default([]),
  // Enough for a full gallery without letting one product hold a media
  // library. Shopify's own limit is 250.
  images: z.array(productImageSchema).max(250).default([]),
  variants: z
    .array(variantSchema)
    .min(1, 'A product needs at least one variant')
    // Three axes of 100 values each would be 1,000,000 rows; the real ceiling
    // is what an editor can meaningfully manage and what a page can render.
    .max(500, 'A product can have at most 500 variants'),
})

export type CreateProductInput = z.infer<typeof createProductSchema>

export const updateProductSchema = createProductSchema.partial().extend({
  title: z.string().trim().min(1).max(200).optional(),
})

export type UpdateProductInput = z.infer<typeof updateProductSchema>

export const adjustInventorySchema = z.object({
  variantId: z.string().min(1),
  locationId: z.string().min(1),
  /** Signed delta, not an absolute count — see inventoryService. */
  delta: z.number().int(),
  reason: z
    .enum(['MANUAL', 'RECEIVED', 'DAMAGED', 'CORRECTION', 'RESTOCK'])
    .default('MANUAL'),
  note: z.string().trim().max(500).optional(),
})

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>

export type ProductFormState = { error?: string; success?: string } | undefined
