import { currencyExponent } from '@/lib/money'
import { safeHref } from './sanitizeHtml'

/**
 * What an online store's blocks are given to draw a shop with.
 *
 * A landing page's blocks are handed their offers (`StorefrontCommerce`); a
 * store's blocks are handed the catalogue, already shaped for display. The
 * shapes here are plain, serialisable data on purpose — the same object is
 * built by the public site on the server and by the builder canvas in the
 * browser, crosses `postMessage` into the canvas iframe, and must render the
 * same page either way. Nothing here carries a cost price, a stock location or
 * anything else a visitor has no business reading in the page source.
 *
 * Prices are display data only. What anything costs is decided by the pricing
 * engine when it is added to a cart and again at checkout; a block that shows
 * a stale price here shows a stale price, it does not charge one.
 */

export type SiteKind = 'LANDING' | 'STORE'
export type PageRole = 'STANDARD' | 'LAYOUT' | 'PRODUCT' | 'CATALOG'

/** One product, as a card in a grid shows it. */
export interface StoreProductCard {
  id: string
  handle: string
  title: string
  imageUrl: string | null
  /** The second photo, which a card can swap to on hover. */
  hoverImageUrl: string | null
  /** The cheapest variant's price. */
  priceCents: number
  /** What the cheapest variant used to cost, when that is higher. */
  compareAtPriceCents: number | null
  /** True when variants are priced differently, so the card can say "from". */
  priceVaries: boolean
  /** False when every variant is sold out. */
  available: boolean
  /**
   * The variant a one-tap "Add to cart" adds, set only when there is exactly
   * one. A product with sizes has to be opened to be bought — guessing the
   * size for the shopper is how a store ships the wrong one.
   */
  quickAddVariantId: string | null
  vendor: string | null
}

export interface StoreVariant {
  id: string
  title: string
  /** Option values in the product's option order, e.g. ["L", "Red"]. */
  options: string[]
  priceCents: number
  compareAtPriceCents: number | null
  available: boolean
  /**
   * Units left, only when stock is tracked and low enough that saying so helps
   * the shopper decide. Exact counts above that are the merchant's business.
   */
  stockLeft: number | null
  imageUrl: string | null
}

/** One product, as its own page shows it. */
export interface StoreProductDetail extends StoreProductCard {
  /** Sanitised HTML, safe to set as markup. */
  descriptionHtml: string
  images: { url: string; alt: string | null }[]
  options: { name: string; values: string[] }[]
  variants: StoreVariant[]
  categoryId: string | null
  tags: string[]
}

export interface StoreCategory {
  id: string
  handle: string
  name: string
  parentId: string | null
  imageUrl: string | null
  productCount: number | null
}

export interface StoreCollection {
  id: string
  handle: string
  title: string
  imageUrl: string | null
}

export const LISTING_SORTS = [
  'featured',
  'newest',
  'price-asc',
  'price-desc',
  'name',
] as const

export type ListingSort = (typeof LISTING_SORTS)[number]

export const LISTING_SORT_LABELS: Record<ListingSort, string> = {
  featured: 'Featured',
  newest: 'Newest',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  name: 'Name: A to Z',
}

/** The list a catalogue page is showing — a category, a search, the shop. */
export interface StoreListing {
  kind: 'all' | 'category' | 'collection' | 'search'
  title: string
  description: string | null
  imageUrl: string | null
  /** The category or collection handle, for links that keep the filter. */
  handle: string | null
  /** What was searched for, on a search page. */
  query: string | null
  products: StoreProductCard[]
  /** Matching products across every page, when the catalogue can count. */
  total: number | null
  page: number
  pageCount: number
  sort: ListingSort
  /** The children of the category being viewed, to narrow down by. */
  subcategories: StoreCategory[]
}

/**
 * Which products a block wants, declared by the block and fetched by the page.
 *
 * Blocks render synchronously — the same component runs on the server for the
 * live site and in the browser inside the builder canvas — so a block cannot
 * go and fetch its own products. It says what it wants here, the page loads
 * every block's answer in one pass, and the block reads the result from
 * `StorefrontContext.sectionProducts`.
 */
export interface StorefrontProductQuery {
  source: 'newest' | 'category' | 'collection' | 'picked' | 'related' | 'refs'
  categoryId?: string | null
  collectionId?: string | null
  productIds?: string[]
  /**
   * For `refs`: products named the way a custom-code design names them — by
   * id or by handle, whichever its author had to hand. A merchant writing
   * their own HTML knows a product from its address (`/products/cotton-tee`),
   * an AI from the ids NCOM gave it, and both should work.
   */
  productRefs?: string[]
  limit: number
}

/** A stable key for a query, so two blocks asking the same thing share it. */
export function productQueryKey(query: StorefrontProductQuery): string {
  return JSON.stringify([
    query.source,
    query.categoryId ?? null,
    query.collectionId ?? null,
    query.productIds ?? [],
    query.limit,
    ...(query.productRefs?.length ? [query.productRefs] : []),
  ])
}

export interface StorefrontContext {
  storeName: string
  currencyCode: string
  /**
   * Prepended to every link a block draws.
   *
   * Empty on the live site, where `/products/shirt` is right as it stands. A
   * preview runs on NCOM's own address, where that path is a dashboard 404, so
   * there it is the store's own origin and links leave the preview for the
   * real site.
   */
  linkBase: string
  categories: StoreCategory[]
  collections: StoreCollection[]
  /** Products each block asked for, keyed by section id. */
  sectionProducts: Record<string, StoreProductCard[]>
  /** The product being viewed, on a product page. */
  product?: StoreProductDetail | null
  /** The list being viewed, on a catalogue page. */
  listing?: StoreListing | null
  /** Whether shoppers can sign in. Hides the account link when they cannot. */
  accountsEnabled: boolean
  /**
   * True when products come from the merchant's own website and it did not
   * answer, so a block can say "back soon" rather than "no products".
   */
  catalogUnavailable?: boolean
  /**
   * True when the products shown are made-up examples — the builder, before a
   * merchant has added any of their own — so a block can say so.
   */
  sample?: boolean
}

// ── Links ────────────────────────────────────────────────────────────────

/**
 * Every address an online store answers on, in one place.
 *
 * The route folders under app/(public-site)/sites/[subdomain] are the other
 * half of this list; the two change together. Slugs a merchant's own pages may
 * not take are derived from it, so a page named "cart" can never sit where the
 * cart is.
 */
export const STORE_ROUTE_SEGMENTS = [
  'products',
  'categories',
  'collections',
  'search',
  'cart',
  'checkout',
  'account',
] as const

export function storePaths(linkBase = '') {
  const at = (path: string) => `${linkBase}${path}`
  return {
    home: at('/'),
    allProducts: at('/products'),
    product: (handle: string) => at(`/products/${encodeURIComponent(handle)}`),
    category: (handle: string) =>
      at(`/categories/${encodeURIComponent(handle)}`),
    collection: (handle: string) =>
      at(`/collections/${encodeURIComponent(handle)}`),
    search: (query?: string) =>
      at(query ? `/search?${new URLSearchParams({ q: query })}` : '/search'),
    cart: at('/cart'),
    checkout: at('/checkout'),
    account: at('/account'),
    login: at('/account/login'),
    register: at('/account/register'),
  }
}

/**
 * A link a merchant typed, made to work wherever the page is being shown.
 *
 * Merchants write menu links as the paths they see on their live site
 * ("/products", "/about"), so those get the same prefix the store's own links
 * do. Full URLs, anchors, mail and phone links are left exactly as typed.
 */
export function storeHref(href: string | null | undefined, linkBase = '') {
  const value = (href ?? '').trim()
  if (!value) return linkBase || '/'
  if (value.startsWith('/') && !value.startsWith('//')) {
    return `${linkBase}${value}`
  }
  // Anything else goes through the same scheme allow-list rich text uses, so
  // a menu link typed as `javascript:…` becomes a dead link rather than a
  // script on the merchant's own shop.
  return safeHref(value) ?? '#'
}

// ── Money ────────────────────────────────────────────────────────────────

/**
 * A price for a shelf, not an invoice: "৳1,250" rather than "৳1,250.00".
 *
 * Whole amounts drop their zeros because that is how shops in this market
 * write prices and because a grid of ".00"s is noise. Amounts with paisa or
 * cents in them keep their decimals — rounding a price for display would show
 * a figure the checkout then contradicts.
 */
export function formatShelfPrice(cents: number, currencyCode: string): string {
  const exponent = currencyExponent(currencyCode)
  const major = cents / 10 ** exponent
  const whole = Number.isInteger(major)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : exponent,
    maximumFractionDigits: whole ? 0 : exponent,
  }).format(major)
}

/** "Save 20%", or null when the saving rounds to nothing worth saying. */
export function savingPercent(
  priceCents: number,
  compareAtPriceCents: number | null
): number | null {
  if (!compareAtPriceCents || compareAtPriceCents <= priceCents) return null
  const percent = Math.round(
    ((compareAtPriceCents - priceCents) / compareAtPriceCents) * 100
  )
  return percent >= 1 ? percent : null
}
