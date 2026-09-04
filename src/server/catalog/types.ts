/**
 * The catalogue, as NCOM sees it — from either of the two places it can live.
 *
 * A workspace sells from two sources at once:
 *
 *   **REMOTE** — the merchant's own website, read live on every request that
 *   needs it and never stored here. There is no table behind these values; they
 *   are thrown away when the response is sent. See server/catalog/client.ts.
 *
 *   **LOCAL** — products created in NCOM itself, stored in this database like
 *   any other row. A merchant who wants to sell something their shop does not
 *   carry — a bundle-only item, a campaign gift, a product they have not
 *   launched on their own site yet — adds it here.
 *
 * Both appear in one merged catalogue. An offer, a cart and an order can mix
 * them freely, and nothing downstream of server/catalog needs to know which is
 * which except the two places where it genuinely matters: editing (only local
 * products can be edited here) and stock movements (local stock is moved by us,
 * remote stock is asked of them).
 *
 * Ids are whoever's ids they are. A local product's id is a cuid we minted; a
 * remote one's is whatever the merchant's system calls it — a WooCommerce post
 * id, a SKU, a UUID. NCOM never mints an id for a remote product, because the
 * moment it does it owns a mapping table, and a mapping table is storage of
 * their catalogue by another name.
 */

/** Where a product is kept, and therefore who may change it. */
export type CatalogSource = 'LOCAL' | 'REMOTE'

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

export interface CatalogImage {
  /** Absolute URL on the merchant's own site or CDN. Never copied here. */
  url: string
  alt: string | null
}

export interface CatalogVariant extends StockState {
  source: CatalogSource
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

export interface CatalogProduct {
  /** Which of the two catalogues this came from. */
  source: CatalogSource
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
  images: CatalogImage[]
  options: { name: string; values: string[] }[]
  variants: CatalogVariant[]
  url: string | null
}

export interface CatalogCategory {
  source: CatalogSource
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
  products: CatalogProduct[]
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
