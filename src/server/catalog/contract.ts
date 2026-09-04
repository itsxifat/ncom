import { z } from 'zod'
import { parseMoneyInput } from '@/lib/money'
import { CatalogContractError } from './errors'
import {
  NO_CAPABILITIES,
  type CatalogCapabilities,
  type CatalogIdentity,
  type ProductPage,
  type RemoteCategory,
  type RemoteImage,
  type RemoteProduct,
  type RemoteVariant,
  type ReserveResult,
} from './types'

/**
 * The wire contract every connected website answers, and the one place that
 * knows how forgiving it is.
 *
 * Two rules shaped this file.
 *
 * **Generous in what we accept.** The other end of this connection is a PHP
 * file a merchant's developer wrote on a Thursday. It will send `stock_quantity`
 * where the docs say `available`, a price as the string "1250.00", an image as
 * a bare URL, and a WooCommerce status of "publish". Refusing any of those
 * would be technically correct and would mean the merchant's storefront shows
 * nothing while everyone argues about whose fault it is. So keys are matched in
 * snake_case or camelCase, money in cents or decimals, and images either way.
 *
 * **Strict in what we conclude.** Once past this file everything is a
 * normalised domain type with integer minor units and an explicit stock state.
 * Nothing downstream re-guesses a price or re-interprets a status, because two
 * places interpreting "publish" differently is how a draft product ends up on
 * sale.
 *
 * A payload that cannot be understood raises CatalogContractError naming the
 * field — that message is shown to the merchant in the connection panel, so it
 * has to be the sentence that tells their developer what to change.
 */

/** The contract revision this build speaks. Sent as `X-NCOM-Contract`. */
export const CONTRACT_VERSION = '1'

// ── Key normalisation ────────────────────────────────────────────────────
//
// `stock_quantity` and `stockQuantity` are the same field. Rather than write
// every alias into every schema, incoming objects are walked once and their
// keys camel-cased. Values are untouched.

function camel(key: string): string {
  return key.includes('_')
    ? key.replace(/_([a-z0-9])/gi, (_, char: string) => char.toUpperCase())
    : key
}

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const normalized = camel(key)
      // A payload carrying both spellings keeps the camelCase one: it is the
      // documented name, so it is the one the author meant.
      if (normalized in out && key !== normalized) continue
      out[normalized] = camelizeKeys(entry)
    }
    return out
  }
  return value
}

// ── Primitives ───────────────────────────────────────────────────────────

const nullableString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text.length === 0 ? null : text
  })

/** An id is anything printable; numbers are stringified so 42 and "42" agree. */
const idValue = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0 && value.length <= 200, {
    message: 'must be a non-empty id of at most 200 characters',
  })

const moneyValue = z.union([z.string(), z.number()])

const booleanish = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const text = value.trim().toLowerCase()
    return text === 'true' || text === '1' || text === 'yes' || text === 'on'
  })

const imageValue = z.union([
  z.string(),
  z.object({
    url: z.string().optional(),
    src: z.string().optional(),
    alt: nullableString.optional(),
  }),
])

// ── Schemas ──────────────────────────────────────────────────────────────

const variantSchema = z.object({
  id: idValue.optional(),
  title: nullableString.optional(),
  name: nullableString.optional(),
  sku: nullableString.optional(),
  barcode: nullableString.optional(),

  price: moneyValue.optional(),
  priceCents: z.number().int().optional(),
  compareAtPrice: moneyValue.nullish(),
  compareAtPriceCents: z.number().int().nullish(),

  options: z.array(nullableString).optional(),
  option1: nullableString.optional(),
  option2: nullableString.optional(),
  option3: nullableString.optional(),

  available: z.union([z.number(), z.string(), z.null()]).optional(),
  stock: z.union([z.number(), z.string(), z.null()]).optional(),
  stockQuantity: z.union([z.number(), z.string(), z.null()]).optional(),
  quantity: z.union([z.number(), z.string(), z.null()]).optional(),
  inStock: booleanish.optional(),
  tracked: booleanish.optional(),
  manageStock: booleanish.optional(),
  policy: nullableString.optional(),
  backorders: nullableString.optional(),

  requiresShipping: booleanish.optional(),
  virtual: booleanish.optional(),
  weightGrams: z.union([z.number(), z.string()]).optional(),
  imageUrl: nullableString.optional(),
  image: imageValue.nullish(),
  taxable: booleanish.optional(),
  taxCode: nullableString.optional(),
})

const productSchema = z.object({
  id: idValue,
  handle: nullableString.optional(),
  slug: nullableString.optional(),
  title: nullableString.optional(),
  name: nullableString.optional(),
  description: nullableString.optional(),
  status: nullableString.optional(),
  vendor: nullableString.optional(),
  brand: nullableString.optional(),
  productType: nullableString.optional(),
  tags: z.array(nullableString).optional(),
  categoryId: idValue.nullish(),
  categoryIds: z.array(idValue).optional(),
  collectionIds: z.array(idValue).optional(),
  url: nullableString.optional(),
  permalink: nullableString.optional(),

  images: z.array(imageValue).optional(),
  imageUrl: nullableString.optional(),
  options: z
    .array(
      z.object({
        name: nullableString.optional(),
        values: z.array(nullableString).optional(),
      })
    )
    .optional(),
  variants: z.array(variantSchema).optional(),

  // Simple products carry their price and stock at the top level and have no
  // variants at all; those fields are read by syntheticVariant below.
  price: moneyValue.optional(),
  priceCents: z.number().int().optional(),
  compareAtPrice: moneyValue.nullish(),
  compareAtPriceCents: z.number().int().nullish(),
  sku: nullableString.optional(),
  available: z.union([z.number(), z.string(), z.null()]).optional(),
  stock: z.union([z.number(), z.string(), z.null()]).optional(),
  stockQuantity: z.union([z.number(), z.string(), z.null()]).optional(),
  inStock: booleanish.optional(),
  tracked: booleanish.optional(),
  manageStock: booleanish.optional(),
  policy: nullableString.optional(),
  requiresShipping: booleanish.optional(),
  weightGrams: z.union([z.number(), z.string()]).optional(),
  taxable: booleanish.optional(),
  taxCode: nullableString.optional(),
})

const productListSchema = z.object({
  products: z.array(productSchema).optional(),
  data: z.array(productSchema).optional(),
  items: z.array(productSchema).optional(),
  nextCursor: nullableString.optional(),
  cursor: nullableString.optional(),
  total: z.union([z.number(), z.string(), z.null()]).optional(),
})

const singleProductSchema = z.object({
  product: productSchema.optional(),
  data: productSchema.optional(),
})

const stockRowSchema = z.object({
  id: idValue.optional(),
  variantId: idValue.optional(),
  sku: nullableString.optional(),
  available: z.union([z.number(), z.string(), z.null()]).optional(),
  stock: z.union([z.number(), z.string(), z.null()]).optional(),
  stockQuantity: z.union([z.number(), z.string(), z.null()]).optional(),
  quantity: z.union([z.number(), z.string(), z.null()]).optional(),
  inStock: booleanish.optional(),
  tracked: booleanish.optional(),
  manageStock: booleanish.optional(),
  policy: nullableString.optional(),
  backorders: nullableString.optional(),
})

const stockListSchema = z.object({
  stock: z.array(stockRowSchema).optional(),
  data: z.array(stockRowSchema).optional(),
  items: z.array(stockRowSchema).optional(),
})

const variantListSchema = z.object({
  variants: z
    .array(variantSchema.extend({ productId: idValue.optional() }))
    .optional(),
  data: z
    .array(variantSchema.extend({ productId: idValue.optional() }))
    .optional(),
})

const categorySchema = z.object({
  id: idValue,
  name: nullableString.optional(),
  title: nullableString.optional(),
  handle: nullableString.optional(),
  slug: nullableString.optional(),
  parentId: idValue.nullish(),
  parent: idValue.nullish(),
  imageUrl: nullableString.optional(),
  image: imageValue.nullish(),
  count: z.union([z.number(), z.string(), z.null()]).optional(),
  productCount: z.union([z.number(), z.string(), z.null()]).optional(),
})

const categoryListSchema = z.object({
  categories: z.array(categorySchema).optional(),
  data: z.array(categorySchema).optional(),
})

const capabilitySchema = z
  .object({
    products: booleanish.optional(),
    stock: booleanish.optional(),
    search: booleanish.optional(),
    categories: booleanish.optional(),
    reserve: booleanish.optional(),
    release: booleanish.optional(),
  })
  .optional()

const pingSchema = z.object({
  ok: booleanish.optional(),
  contract: z.union([z.string(), z.number()]).optional(),
  platform: nullableString.optional(),
  currency: nullableString.optional(),
  capabilities: capabilitySchema,
})

const reserveSchema = z.object({
  ok: booleanish.optional(),
  rejected: z
    .array(
      z.object({
        variantId: idValue.optional(),
        id: idValue.optional(),
        reason: nullableString.optional(),
      })
    )
    .optional(),
})

// ── Normalisers ──────────────────────────────────────────────────────────

function parse<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
  what: string
): z.infer<T> {
  const result = schema.safeParse(camelizeKeys(payload))
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join('.') || '(root)'
    throw new CatalogContractError(
      `The ${what} response did not match the connector contract: ${path} ${issue?.message ?? 'is invalid'}.`
    )
  }
  return result.data
}

function toCents(
  cents: number | null | undefined,
  major: string | number | null | undefined,
  currencyCode: string
): number | null {
  if (typeof cents === 'number' && Number.isFinite(cents)) {
    return Math.max(0, Math.round(cents))
  }
  if (major === null || major === undefined || major === '') return null
  try {
    return Math.max(0, parseMoneyInput(major, currencyCode))
  } catch {
    return null
  }
}

function toCount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.trunc(parsed)
}

/**
 * The stock rule, in one place because three endpoints answer it.
 *
 * A count wins over every shorthand. Failing that, an explicit `tracked: false`
 * (or WooCommerce's `manageStock: false`) means the merchant does not count
 * this line and it is always sellable. `inStock` is the last resort: false is
 * an honest zero, and true means "sell it" rather than any particular number,
 * because inventing a count from a boolean is how a site that never tracked
 * stock starts refusing the second unit of an order.
 */
function readStock(row: {
  available?: number | string | null
  stock?: number | string | null
  stockQuantity?: number | string | null
  quantity?: number | string | null
  inStock?: boolean
  tracked?: boolean
  manageStock?: boolean
  policy?: string | null
  backorders?: string | null
}): { available: number | null; policy: 'DENY' | 'CONTINUE' } {
  const policyWord = (row.policy ?? row.backorders ?? '').toLowerCase()
  const policy: 'DENY' | 'CONTINUE' =
    policyWord === 'continue' ||
    policyWord === 'backorder' ||
    policyWord === 'yes' ||
    policyWord === 'notify'
      ? 'CONTINUE'
      : 'DENY'

  const counted =
    toCount(row.available) ??
    toCount(row.stock) ??
    toCount(row.stockQuantity) ??
    toCount(row.quantity)

  if (counted !== null) return { available: counted, policy }

  const tracked = row.tracked ?? row.manageStock
  if (tracked === false) return { available: null, policy }

  if (row.inStock === false) return { available: 0, policy }
  if (row.inStock === true) return { available: null, policy }

  // Nothing said at all. Treated as untracked rather than as zero: a site that
  // does not report stock is telling us it does not count, and reading silence
  // as "sold out" would take every such catalogue off sale.
  return { available: null, policy }
}

function readImage(value: unknown): RemoteImage | null {
  if (typeof value === 'string') {
    const url = value.trim()
    return url ? { url, alt: null } : null
  }
  if (value && typeof value === 'object') {
    const record = value as { url?: unknown; src?: unknown; alt?: unknown }
    const url = String(record.url ?? record.src ?? '').trim()
    if (!url) return null
    const alt =
      typeof record.alt === 'string' && record.alt.trim().length > 0
        ? record.alt.trim()
        : null
    return { url, alt }
  }
  return null
}

function readStatus(value: string | null | undefined): RemoteProduct['status'] {
  const word = (value ?? '').toLowerCase()
  if (word === 'draft' || word === 'pending' || word === 'unpublished') {
    return 'DRAFT'
  }
  if (word === 'archived' || word === 'private' || word === 'trash') {
    return 'ARCHIVED'
  }
  // Unset means published. A site that does not model drafts at all should not
  // have to say so on every row, and the ones that do send "publish".
  return 'ACTIVE'
}

type VariantInput = z.infer<typeof variantSchema> & { productId?: string }

function toVariant(
  raw: VariantInput,
  product: {
    id: string
    title: string
    priceCents: number | null
    imageUrl: string | null
  },
  currencyCode: string,
  index: number
): RemoteVariant {
  const priceCents =
    toCents(raw.priceCents, raw.price, currencyCode) ?? product.priceCents ?? 0

  const options = (
    raw.options && raw.options.length > 0
      ? raw.options
      : [raw.option1, raw.option2, raw.option3]
  ).filter(
    (value): value is string => typeof value === 'string' && value !== ''
  )

  const stock = readStock(raw)

  const weight = toCount(raw.weightGrams) ?? 0

  return {
    id: raw.id ?? (index === 0 ? product.id : `${product.id}:${index}`),
    productId: raw.productId ?? product.id,
    // A variant with no title of its own is named by its option values, and
    // failing that by the product. `options.join()` is never null, so it has to
    // be tested for emptiness rather than chained through `??` — which is how
    // an untitled single-variant product ends up in a cart as "".
    title:
      raw.title ??
      raw.name ??
      (options.length > 0 ? options.join(' / ') : product.title),
    sku: raw.sku ?? null,
    barcode: raw.barcode ?? null,
    priceCents,
    compareAtPriceCents: toCents(
      raw.compareAtPriceCents ?? undefined,
      raw.compareAtPrice ?? undefined,
      currencyCode
    ),
    options,
    available: stock.available,
    policy: stock.policy,
    // `virtual` is WooCommerce's word for it; either spelling means no parcel.
    requiresShipping:
      raw.virtual === true ? false : (raw.requiresShipping ?? true),
    weightGrams: Math.max(0, weight),
    imageUrl: raw.imageUrl ?? readImage(raw.image)?.url ?? product.imageUrl,
    isTaxable: raw.taxable ?? true,
    taxCode: raw.taxCode ?? null,
  }
}

function toProduct(
  raw: z.infer<typeof productSchema>,
  currencyCode: string
): RemoteProduct {
  const title = raw.title ?? raw.name ?? 'Untitled product'
  const images = (raw.images ?? [])
    .map(readImage)
    .filter((image): image is RemoteImage => image !== null)

  if (images.length === 0 && raw.imageUrl) {
    images.push({ url: raw.imageUrl, alt: null })
  }

  const productPriceCents = toCents(raw.priceCents, raw.price, currencyCode)
  const context = {
    id: raw.id,
    title,
    priceCents: productPriceCents,
    imageUrl: images[0]?.url ?? null,
  }

  // A product with no variants is a simple product: one sellable line whose id
  // is the product's own id, built from the top-level price and stock. Sites
  // selling one SKU per product never have to invent a variant model for us.
  const variants: RemoteVariant[] =
    raw.variants && raw.variants.length > 0
      ? raw.variants.map((variant, index) =>
          toVariant(variant, context, currencyCode, index)
        )
      : [
          toVariant(
            {
              id: raw.id,
              title,
              sku: raw.sku,
              priceCents: raw.priceCents,
              price: raw.price,
              compareAtPrice: raw.compareAtPrice,
              compareAtPriceCents: raw.compareAtPriceCents,
              available: raw.available,
              stock: raw.stock,
              stockQuantity: raw.stockQuantity,
              inStock: raw.inStock,
              tracked: raw.tracked,
              manageStock: raw.manageStock,
              policy: raw.policy,
              requiresShipping: raw.requiresShipping,
              weightGrams: raw.weightGrams,
              taxable: raw.taxable,
              taxCode: raw.taxCode,
            },
            context,
            currencyCode,
            0
          ),
        ]

  const groupIds = [
    ...new Set(
      [
        raw.categoryId ?? null,
        ...(raw.categoryIds ?? []),
        ...(raw.collectionIds ?? []),
      ].filter((value): value is string => typeof value === 'string')
    ),
  ]

  return {
    id: raw.id,
    handle: raw.handle ?? raw.slug ?? raw.id,
    title,
    description: raw.description ?? null,
    status: readStatus(raw.status),
    vendor: raw.vendor ?? raw.brand ?? null,
    productType: raw.productType ?? null,
    tags: (raw.tags ?? []).filter(
      (tag): tag is string => typeof tag === 'string'
    ),
    categoryId: raw.categoryId ?? raw.categoryIds?.[0] ?? null,
    groupIds,
    images,
    options: (raw.options ?? []).map((option) => ({
      name: option.name ?? '',
      values: (option.values ?? []).filter(
        (value): value is string => typeof value === 'string'
      ),
    })),
    variants,
    url: raw.url ?? raw.permalink ?? null,
  }
}

export function parseProductPage(
  payload: unknown,
  currencyCode: string
): ProductPage {
  const raw = parse(productListSchema, payload, 'product list')
  const rows = raw.products ?? raw.data ?? raw.items ?? []

  return {
    products: rows.map((row) => toProduct(row, currencyCode)),
    nextCursor: raw.nextCursor ?? raw.cursor ?? null,
    total: toCount(raw.total),
  }
}

export function parseProduct(
  payload: unknown,
  currencyCode: string
): RemoteProduct | null {
  const wrapper = parse(singleProductSchema, payload, 'product')
  const row = wrapper.product ?? wrapper.data
  if (row) return toProduct(row, currencyCode)

  // A connector that returns the product unwrapped is answering the question
  // that was asked; there is no reason to refuse it.
  const bare = productSchema.safeParse(camelizeKeys(payload))
  return bare.success ? toProduct(bare.data, currencyCode) : null
}

export function parseVariants(
  payload: unknown,
  currencyCode: string
): RemoteVariant[] {
  const raw = parse(variantListSchema, payload, 'variant')
  const rows = raw.variants ?? raw.data ?? []

  return rows.map((row, index) =>
    toVariant(
      row,
      {
        id: row.productId ?? row.id ?? '',
        title: row.title ?? row.name ?? '',
        priceCents: null,
        imageUrl: null,
      },
      currencyCode,
      index
    )
  )
}

export function parseStock(payload: unknown): Map<string, StockRow> {
  const raw = parse(stockListSchema, payload, 'stock')
  const rows = raw.stock ?? raw.data ?? raw.items ?? []

  const stock = new Map<string, StockRow>()
  for (const row of rows) {
    const id = row.variantId ?? row.id
    if (!id) continue
    stock.set(id, readStock(row))
  }
  return stock
}

export interface StockRow {
  available: number | null
  policy: 'DENY' | 'CONTINUE'
}

export function parseCategories(payload: unknown): RemoteCategory[] {
  const raw = parse(categoryListSchema, payload, 'category')
  const rows = raw.categories ?? raw.data ?? []

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? row.title ?? row.id,
    handle: row.handle ?? row.slug ?? row.id,
    parentId: row.parentId ?? row.parent ?? null,
    imageUrl: row.imageUrl ?? readImage(row.image)?.url ?? null,
    productCount: toCount(row.productCount ?? row.count),
  }))
}

export function parseIdentity(payload: unknown): CatalogIdentity {
  const raw = parse(pingSchema, payload, 'ping')

  const declared = raw.capabilities
  const capabilities: CatalogCapabilities = declared
    ? {
        ...NO_CAPABILITIES,
        // Products and stock are the contract's floor: a connector that answers
        // the handshake at all is claiming those two, and a merchant who forgot
        // to list them should not have a dead storefront as the punishment.
        products: declared.products ?? true,
        stock: declared.stock ?? true,
        search: declared.search ?? false,
        categories: declared.categories ?? false,
        reserve: declared.reserve ?? false,
        release: declared.release ?? declared.reserve ?? false,
      }
    : { ...NO_CAPABILITIES, products: true, stock: true }

  return {
    contract:
      raw.contract === undefined ? CONTRACT_VERSION : String(raw.contract),
    platform: raw.platform ?? null,
    currency: raw.currency ? raw.currency.toUpperCase() : null,
    capabilities,
  }
}

export function parseReserve(payload: unknown): ReserveResult {
  const raw = parse(reserveSchema, payload, 'reserve')
  const rejected = (raw.rejected ?? [])
    .map((row) => ({
      variantId: row.variantId ?? row.id ?? '',
      reason: row.reason ?? null,
    }))
    .filter((row) => row.variantId !== '')

  return { ok: (raw.ok ?? true) && rejected.length === 0, rejected }
}
