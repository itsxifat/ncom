/**
 * The wire shapes an offer travels in.
 *
 * These cross the server/browser boundary in both directions — the page is
 * rendered with `PublicOffer[]`, and the buyer posts back an `OfferSubmission`
 * — so everything here is plain JSON. No Date, no Decimal, no Prisma model
 * leaking into a client bundle.
 *
 * Money is integer minor units and rates are basis points, matching the rest
 * of the platform. A price that arrives as a float is a bug somewhere upstream.
 */

export type OfferKindValue = 'FIXED' | 'COLLECTION' | 'ALACARTE'
export type OfferPricingModeValue = 'AUTO' | 'FIXED' | 'PERCENT' | 'AMOUNT'

/** One buyable variant of a product inside an offer. */
export interface OfferVariantChoice {
  id: string
  title: string
  priceCents: number
  /** False when tracked stock has run out and the policy is to deny. */
  available: boolean
}

/**
 * One product line of an offer.
 *
 * For a FIXED offer this is part of the exact set being sold, and `quantity`
 * is how many the merchant included. For a COLLECTION or ALACARTE offer it is
 * one product in the pool the buyer picks from, and `quantity` is meaningless
 * because the buyer decides.
 */
export interface OfferLine {
  productId: string
  title: string
  imageUrl: string | null
  quantity: number
  /** Set when the merchant pinned a variant; the buyer gets no choice. */
  pinnedVariantId: string | null
  /** The variants the buyer may choose between. Never empty. */
  variants: OfferVariantChoice[]
}

/** One rung of a COLLECTION offer's manual price ladder. */
export interface OfferTierChoice {
  quantity: number
  priceCents: number
}

/** The rule that turns a regular total into what the offer charges. */
export interface OfferPricingRule {
  mode: OfferPricingModeValue
  priceCents: number
  discountBps: number
}

/**
 * An offer as the public page sees it.
 *
 * Deliberately carries the pricing *rule* rather than only a final number, so
 * the browser can re-derive the total the moment the buyer changes a variant
 * or a quantity without a round trip. The server applies the identical rule
 * when the order is placed, and the server's answer is the one that counts.
 */
export interface PublicOffer {
  key: string
  kind: OfferKindValue
  label: string
  description: string | null
  badge: string | null
  imageUrl: string | null
  isDefault: boolean

  /** FIXED: the exact set sold. Empty for pool offers. */
  items: OfferLine[]
  /** COLLECTION / ALACARTE: the pool to pick from. Empty for FIXED. */
  pool: OfferLine[]
  /** COLLECTION: the quantity→price ladder, ascending. */
  tiers: OfferTierChoice[]

  minQuantity: number
  /** 0 means unbounded. */
  maxQuantity: number

  pricing: OfferPricingRule
  /**
   * The strike-through price. Falls back to the computed regular total, which
   * is the honest comparison rather than an invented one.
   */
  compareAtCents: number
  /**
   * What the page leads with: the offer's total for FIXED, the cheapest rung
   * for COLLECTION, the least a buyer could leave with for ALACARTE.
   */
  headlinePriceCents: number
}

/** A delivery area and what it costs. */
export interface ShippingChoice {
  id: string
  label: string
  priceCents: number
}

/** The delivery rules a page renders and charges by. */
export interface PublicShipping {
  /** False when every buyer pays the same and the picker is pointless. */
  askZone: boolean
  rates: ShippingChoice[]
}

/** A promotion the page advertises and the server enforces. */
export interface PublicPromotions {
  freeShipping: {
    enabled: boolean
    minSubtotalCents: number
    minQuantity: number
  }
  discountRules: PublicDiscountRule[]
}

export interface PublicDiscountRule {
  basis: 'SUBTOTAL' | 'QUANTITY'
  thresholdCents: number
  thresholdQuantity: number
  reward: 'AMOUNT' | 'PERCENT'
  valueCents: number
  valueBps: number
  maxDiscountCents: number
  label: string | null
}

/**
 * What the buyer picked.
 *
 * One item per product+variant they chose. A FIXED offer produces one entry
 * per line of the offer; a pool offer produces one per thing they added. The
 * server treats this as a *request*, not a fact: every id is checked against
 * the offer it claims to belong to, and every price is looked up fresh.
 */
export interface OfferSelectionItem {
  productId: string
  variantId: string
  quantity: number
}
