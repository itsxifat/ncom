/**
 * The Liquid object model — what a template can see.
 *
 * This is a public API. Once tenants have written templates against these
 * names, renaming a key silently breaks live storefronts, so treat additions
 * as cheap and changes as breaking. Keys are snake_case and money is in minor
 * units because that is what Liquid authors expect from Shopify; deviating
 * would mean every ported theme is subtly wrong rather than obviously broken.
 *
 * These are plain objects, deliberately, not LiquidJS `Drop` subclasses.
 * A Drop can lazily resolve properties, which sounds attractive until you
 * notice it lets a template trigger a database query from inside the render
 * sandbox: `{% for p in collection.products %}{{ p.variants }}{% endfor %}`
 * would become an unbounded N+1 that no render limit can meaningfully bound.
 * Building complete plain objects before rendering means all data access is
 * done up front, in one auditable place, with known cost — and it makes the
 * whole scope JSON-serialisable, which is what allows publish-time compilation
 * and caching.
 *
 * Exposure rule: everything here is world-readable by the storefront's
 * visitors. Nothing that is not may appear — no cost prices, no payment
 * credentials, no password hashes, no cross-store ids. Adding a field to a
 * drop is a disclosure decision, not a convenience.
 */

// ── Shop ─────────────────────────────────────────────────────────────────

export interface ShopDrop {
  name: string
  description: string | null
  /** Drives the money filters — see lib/liquid/filters.ts. */
  currency: string
  locale: string
  url: string
  domain: string
  email: string | null
  phone: string | null
  money_format: string
  customer_accounts_enabled: boolean
}

// ── Catalog ──────────────────────────────────────────────────────────────

export interface ImageDrop {
  id: string
  src: string
  alt: string | null
  width: number | null
  height: number | null
  position: number
}

export interface VariantDrop {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  /** Minor units, matching Shopify's `variant.price`. */
  price: number
  compare_at_price: number | null
  available: boolean
  inventory_quantity: number
  inventory_policy: 'deny' | 'continue'
  inventory_management: string | null
  option1: string | null
  option2: string | null
  option3: string | null
  options: string[]
  requires_shipping: boolean
  weight: number
  weight_unit: string
  taxable: boolean
  image: ImageDrop | null
  url: string
}

export interface ProductOptionDrop {
  name: string
  position: number
  values: string[]
}

export interface ProductDrop {
  id: string
  title: string
  handle: string
  description: string | null
  /** Shopify alias for `description`; themes use both interchangeably. */
  content: string | null
  url: string
  available: boolean
  price: number
  price_min: number
  price_max: number
  price_varies: boolean
  compare_at_price: number | null
  compare_at_price_min: number | null
  compare_at_price_max: number | null
  vendor: string | null
  type: string | null
  tags: string[]
  published_at: string | null
  created_at: string
  options: ProductOptionDrop[]
  options_with_values: ProductOptionDrop[]
  variants: VariantDrop[]
  first_available_variant: VariantDrop | null
  selected_or_first_available_variant: VariantDrop | null
  images: ImageDrop[]
  featured_image: ImageDrop | null
  seo_title: string | null
  seo_description: string | null
}

export interface CollectionDrop {
  id: string
  title: string
  handle: string
  description: string | null
  url: string
  image: ImageDrop | null
  products: ProductDrop[]
  products_count: number
  all_products_count: number
  seo_title: string | null
  seo_description: string | null
}

// ── Cart ─────────────────────────────────────────────────────────────────

export interface LineItemDrop {
  id: string
  quantity: number
  title: string
  /** Unit price in minor units. */
  price: number
  /** price * quantity, before line discounts. */
  line_price: number
  original_line_price: number
  final_line_price: number
  product: ProductDrop | null
  variant: VariantDrop | null
  product_title: string
  variant_title: string | null
  sku: string | null
  url: string
  image: ImageDrop | null
  properties: Record<string, unknown>
  requires_shipping: boolean
}

export interface CartDrop {
  id: string
  item_count: number
  items: LineItemDrop[]
  total_price: number
  original_total_price: number
  total_discount: number
  currency: string
  note: string | null
  empty: boolean
  requires_shipping: boolean
  total_weight: number
}

// ── Customer & orders ────────────────────────────────────────────────────

export interface AddressDrop {
  id: string | null
  first_name: string | null
  last_name: string | null
  name: string
  company: string | null
  address1: string
  address2: string | null
  city: string
  province_code: string | null
  country_code: string
  zip: string | null
  phone: string | null
}

export interface CustomerDrop {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  name: string
  phone: string | null
  orders_count: number
  total_spent: number
  accepts_marketing: boolean
  addresses: AddressDrop[]
  default_address: AddressDrop | null
  // Deliberately absent: password_hash, tags, note. The first is a credential;
  // the other two are merchant-internal annotations that customers should not
  // be able to read off their own account page.
}

export interface OrderDrop {
  id: string
  name: string
  order_number: string
  created_at: string
  processed_at: string
  email: string
  currency: string
  subtotal_price: number
  total_discounts: number
  shipping_price: number
  total_tax: number
  total_price: number
  financial_status: string
  fulfillment_status: string
  line_items: LineItemDrop[]
  shipping_address: AddressDrop | null
  billing_address: AddressDrop | null
  shipping_method: string | null
  cancelled: boolean
  note: string | null
}

// ── Section ──────────────────────────────────────────────────────────────

export interface SectionBlockDrop {
  id: string
  type: string
  settings: Record<string, unknown>
  /** Renders as the `data-block-id` attribute themes use for editor hooks. */
  shopify_attributes: string
}

export interface SectionDrop {
  id: string
  settings: Record<string, unknown>
  blocks: SectionBlockDrop[]
  blocks_count: number
}

// ── The full render scope ────────────────────────────────────────────────

export interface StorefrontScope {
  shop: ShopDrop
  section?: SectionDrop
  page?: {
    title: string
    handle: string
    url: string
    description: string | null
  }
  product?: ProductDrop
  collection?: CollectionDrop
  collections?: CollectionDrop[]
  cart?: CartDrop
  customer?: CustomerDrop | null
  order?: OrderDrop
  /** Current request path, for active-nav highlighting. */
  request_path?: string
  /** ISO timestamp the page was rendered/compiled. */
  now?: string
  [key: string]: unknown
}

// ── Builders ─────────────────────────────────────────────────────────────
//
// Input types are structural subsets rather than Prisma model types, so the
// drop layer does not have to change every time a query's `include` changes,
// and so a caller cannot accidentally pass a row carrying columns that must
// not be exposed (a full ProductVariant row includes `costCents`).

export interface ProductSource {
  id: string
  title: string
  handle: string
  description: string | null
  vendor: string | null
  productType: string | null
  tags: string[]
  publishedAt: Date | null
  createdAt: Date
  seoTitle: string | null
  seoDescription: string | null
  options: { name: string; position: number; values: string[] }[]
  images: {
    id: string
    altText: string | null
    position: number
    media: { url: string; width: number | null; height: number | null }
  }[]
  variants: VariantSource[]
}

export interface VariantSource {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  priceCents: number
  compareAtPriceCents: number | null
  option1: string | null
  option2: string | null
  option3: string | null
  isTaxable: boolean
  requiresShipping: boolean
  weightGrams: number
  inventoryTracked: boolean
  inventoryPolicy: 'DENY' | 'CONTINUE'
  imageId: string | null
  /** Summed across locations by the caller; null when not tracked. */
  availableQuantity?: number | null
}

function toImageDrop(image: ProductSource['images'][number]): ImageDrop {
  return {
    id: image.id,
    src: image.media.url,
    alt: image.altText,
    width: image.media.width,
    height: image.media.height,
    position: image.position,
  }
}

export function buildVariantDrop(
  variant: VariantSource,
  productHandle: string,
  images: ImageDrop[],
  weightUnit: string
): VariantDrop {
  const quantity = variant.availableQuantity ?? 0

  // An untracked variant is always purchasable; a tracked one is purchasable
  // while it has stock, or unconditionally when its policy allows backorder.
  const available =
    !variant.inventoryTracked ||
    variant.inventoryPolicy === 'CONTINUE' ||
    quantity > 0

  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.priceCents,
    compare_at_price: variant.compareAtPriceCents,
    available,
    // Reporting a real count for an untracked variant would let a theme render
    // "0 left" on something that never runs out.
    inventory_quantity: variant.inventoryTracked ? quantity : 0,
    inventory_policy:
      variant.inventoryPolicy === 'CONTINUE' ? 'continue' : 'deny',
    inventory_management: variant.inventoryTracked ? 'ncom' : null,
    option1: variant.option1,
    option2: variant.option2,
    option3: variant.option3,
    options: [variant.option1, variant.option2, variant.option3].filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    ),
    requires_shipping: variant.requiresShipping,
    weight: variant.weightGrams,
    weight_unit: weightUnit,
    taxable: variant.isTaxable,
    image: images.find((image) => image.id === variant.imageId) ?? null,
    url: `/products/${productHandle}?variant=${variant.id}`,
    // costCents is intentionally not mapped — it is margin data, not
    // storefront data.
  }
}

export function buildProductDrop(
  product: ProductSource,
  options: { weightUnit?: string; selectedVariantId?: string } = {}
): ProductDrop {
  const weightUnit = options.weightUnit ?? 'g'
  const images = product.images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(toImageDrop)

  const variants = product.variants.map((variant) =>
    buildVariantDrop(variant, product.handle, images, weightUnit)
  )

  const prices = variants.map((variant) => variant.price)
  const priceMin = prices.length > 0 ? Math.min(...prices) : 0
  const priceMax = prices.length > 0 ? Math.max(...prices) : 0

  const compareAtPrices = variants
    .map((variant) => variant.compare_at_price)
    .filter((price): price is number => typeof price === 'number')

  const firstAvailable = variants.find((variant) => variant.available) ?? null
  const selected = options.selectedVariantId
    ? (variants.find((variant) => variant.id === options.selectedVariantId) ??
      null)
    : null

  const productOptions = product.options
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((option) => ({
      name: option.name,
      position: option.position,
      values: option.values,
    }))

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    content: product.description,
    url: `/products/${product.handle}`,
    available: variants.some((variant) => variant.available),
    price: priceMin,
    price_min: priceMin,
    price_max: priceMax,
    price_varies: priceMin !== priceMax,
    compare_at_price:
      compareAtPrices.length > 0 ? Math.min(...compareAtPrices) : null,
    compare_at_price_min:
      compareAtPrices.length > 0 ? Math.min(...compareAtPrices) : null,
    compare_at_price_max:
      compareAtPrices.length > 0 ? Math.max(...compareAtPrices) : null,
    vendor: product.vendor,
    type: product.productType,
    tags: product.tags,
    published_at: product.publishedAt?.toISOString() ?? null,
    created_at: product.createdAt.toISOString(),
    options: productOptions,
    options_with_values: productOptions,
    variants,
    first_available_variant: firstAvailable,
    // Shopify's semantics: the variant named in the URL if it exists, else the
    // first purchasable one, else the first variant at all — never null for a
    // product that has variants, so themes can render a price unconditionally.
    selected_or_first_available_variant:
      selected ?? firstAvailable ?? variants[0] ?? null,
    images,
    featured_image: images[0] ?? null,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
  }
}

export function buildAddressDrop(
  address: {
    id?: string
    firstName?: string | null
    lastName?: string | null
    company?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    provinceCode?: string | null
    countryCode?: string | null
    postalCode?: string | null
    phone?: string | null
  } | null
): AddressDrop | null {
  if (!address) return null

  return {
    id: address.id ?? null,
    first_name: address.firstName ?? null,
    last_name: address.lastName ?? null,
    name: [address.firstName, address.lastName].filter(Boolean).join(' '),
    company: address.company ?? null,
    address1: address.address1 ?? '',
    address2: address.address2 ?? null,
    city: address.city ?? '',
    province_code: address.provinceCode ?? null,
    country_code: address.countryCode ?? '',
    zip: address.postalCode ?? null,
    phone: address.phone ?? null,
  }
}

export function buildSectionDrop(
  sectionId: string,
  content: Record<string, unknown>
): SectionDrop {
  // Blocks live under a reserved `blocks` key in the section's content (see
  // compileSchemaToFields); everything else is a setting.
  const { blocks: rawBlocks, ...settings } = content
  const blockList = Array.isArray(rawBlocks) ? rawBlocks : []

  const blocks: SectionBlockDrop[] = blockList.map((block, index) => {
    const record =
      block && typeof block === 'object'
        ? (block as Record<string, unknown>)
        : {}
    const { type, ...blockSettings } = record
    const id = `${sectionId}-${index}`

    return {
      id,
      type: typeof type === 'string' ? type : 'block',
      settings: blockSettings,
      shopify_attributes: `data-block-id="${id}"`,
    }
  })

  return {
    id: sectionId,
    settings,
    blocks,
    blocks_count: blocks.length,
  }
}
