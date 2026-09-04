/**
 * The catalogue, as NCOM sees it.
 *
 * These are *not* database rows and there is no table behind them. Every value
 * here was read from the merchant's own website within the current request and
 * is thrown away when the response is sent — see server/catalog/client.ts for
 * why nothing is stored or cached.
 *
 * Ids are the merchant's ids. A `productId` in an offer, a cart line or an
 * order line is whatever their system calls that product (a WooCommerce post
 * id, a SKU, a UUID) — NCOM never mints one, because the moment it does it owns
 * a mapping table, and a mapping table is storage of the catalogue by another
 * name.
 */

/** Whether a variant can be sold, and how many. */
export interface StockState {
  /**
   * Units the merchant says are sellable. `null` means the variant is not
   * tracked at all — a service, a made-to-order item, a site that simply does
   * not count — and is always sellable.
   */
  available: number | null
  /** What happens at zero. CONTINUE is the merchant's own backorder decision. */
  policy: 'DENY' | 'CONTINUE'
}

export interface RemoteImage {
  /** Absolute URL on the merchant's own site or CDN. Never copied here. */
  url: string
  alt: string | null
}

export interface RemoteVariant extends StockState {
  id: string
  productId: string
  title: string
  sku: string | null
  barcode: string | null
  priceCents: number
  compareAtPriceCents: number | null
  /** Option values in the product's option order, e.g. ["L", "Red"]. */
  options: string[]
  requiresShipping: boolean
  weightGrams: number
  imageUrl: string | null
  isTaxable: boolean
  taxCode: string | null
}

export interface RemoteProduct {
  id: string
  handle: string
  title: string
  description: string | null
  /**
   * Only ACTIVE products are sellable. A merchant's draft is their statement
   * that it is not ready to be seen, and it is honoured here exactly as the
   * local catalogue used to honour ProductStatus.
   */
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  vendor: string | null
  productType: string | null
  tags: string[]
  categoryId: string | null
  /** Category or collection ids this product belongs to, for discount scoping. */
  groupIds: string[]
  images: RemoteImage[]
  options: { name: string; values: string[] }[]
  variants: RemoteVariant[]
  url: string | null
}

export interface RemoteCategory {
  id: string
  name: string
  handle: string
  parentId: string | null
  imageUrl: string | null
  productCount: number | null
}

export interface ProductQuery {
  limit?: number
  cursor?: string | null
  /** Free-text search, passed through to the merchant's own search. */
  q?: string | null
  categoryId?: string | null
  /** Ask for specific products by id. Used to rehydrate saved references. */
  ids?: string[]
  /** Include products the merchant has not published. Dashboard only. */
  includeDrafts?: boolean
}

export interface ProductPage {
  products: RemoteProduct[]
  /** Opaque, passed straight back on the next call. Null when exhausted. */
  nextCursor: string | null
  /** Total matching products, when the site is able to count them cheaply. */
  total: number | null
}

/**
 * What a connector says it can do.
 *
 * Read from `GET {base}/ping` when the connection is saved or health-checked,
 * and stored on the connection row — this is configuration, not catalogue, and
 * it changes when the merchant redeploys their site rather than when they sell
 * something.
 *
 * Only `products` and `stock` are required to run a storefront. Everything else
 * degrades: no `search` means the dashboard picker filters the first page
 * locally, no `reserve` means stock is checked but not held.
 */
export interface CatalogCapabilities {
  products: boolean
  stock: boolean
  search: boolean
  categories: boolean
  reserve: boolean
  release: boolean
}

export const NO_CAPABILITIES: CatalogCapabilities = {
  products: false,
  stock: false,
  search: false,
  categories: false,
  reserve: false,
  release: false,
}

export interface CatalogIdentity {
  contract: string
  /** Free-form, e.g. "woocommerce/8.6" — shown in the health panel. */
  platform: string | null
  /** ISO 4217, when the site reports one. Mismatches are surfaced, not fixed. */
  currency: string | null
  capabilities: CatalogCapabilities
}

/** One line of a stock movement asked of the merchant's system. */
export interface StockMovementLine {
  variantId: string
  quantity: number
}

export interface ReserveResult {
  ok: boolean
  /** Variants the site refused to hold, with the reason it gave. */
  rejected: { variantId: string; reason: string | null }[]
}
