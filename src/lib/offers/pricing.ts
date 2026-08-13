import type {
  OfferPricingRule,
  OfferTierChoice,
  PublicOffer,
  OfferSelectionItem,
} from './types'

/**
 * The offer pricing rules, as pure arithmetic.
 *
 * This module has no imports beyond its own types on purpose. It is the single
 * definition of what an offer costs, and it runs in three places:
 *
 *   - the order route, where its answer is the money actually charged;
 *   - the buyer's browser, so the total updates as they change a variant or add
 *     a piece, with no round trip;
 *   - the builder's preview, so a merchant sees the real number while editing.
 *
 * Those must never disagree. Anything that needs the database — is this variant
 * in stock, does this product still exist — belongs in offerService, not here.
 *
 * All money is integer minor units. All rates are basis points. Nothing here
 * returns a fraction of a unit: every path ends in Math.round, and totals are
 * clamped at zero because an offer may be configured to discount more than the
 * goods are worth and that must not become a negative charge.
 */

const BPS_DIVISOR = 10_000

function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * What an offer charges for goods, given what those goods list for.
 *
 * FIXED is the merchant's flat price for the whole offer and ignores the
 * regular total entirely — that is the point of it. The others are reductions
 * of the regular total, and none may take it below zero.
 */
export function applyOfferPricing(
  rule: OfferPricingRule,
  regularCents: number
): number {
  const regular = clampPositive(Math.round(regularCents))

  switch (rule.mode) {
    case 'FIXED':
      return clampPositive(Math.round(rule.priceCents))
    case 'AMOUNT':
      return Math.max(0, regular - clampPositive(Math.round(rule.priceCents)))
    case 'PERCENT': {
      const off = Math.round(
        (regular * clampPositive(rule.discountBps)) / BPS_DIVISOR
      )
      return Math.max(0, regular - off)
    }
    default:
      return regular
  }
}

/** The ladder sorted ascending, with unusable rungs dropped. */
export function normalizeTiers(tiers: OfferTierChoice[]): OfferTierChoice[] {
  return tiers
    .filter((tier) => Number.isFinite(tier.quantity) && tier.quantity >= 1)
    .map((tier) => ({
      quantity: Math.round(tier.quantity),
      priceCents: clampPositive(Math.round(tier.priceCents)),
    }))
    .sort((a, b) => a.quantity - b.quantity)
}

/**
 * What a COLLECTION offer charges for exactly this many pieces.
 *
 * An exact-match ladder, not a "nearest rung below" one: the merchant priced
 * 2, 3 and 5 pieces, and a buyer asking for 4 has chosen something that was
 * never given a price. Returning null is what makes the caller refuse rather
 * than invent a total — the alternative is charging the 3-piece price for four
 * pieces, which is a real loss on every such order.
 */
export function tierPriceFor(
  tiers: OfferTierChoice[],
  quantity: number
): number | null {
  const match = normalizeTiers(tiers).find((tier) => tier.quantity === quantity)
  return match ? match.priceCents : null
}

export function minTierQuantity(tiers: OfferTierChoice[]): number {
  const sorted = normalizeTiers(tiers)
  return sorted.length > 0 ? sorted[0].quantity : 1
}

export function maxTierQuantity(tiers: OfferTierChoice[]): number {
  const sorted = normalizeTiers(tiers)
  return sorted.length > 0 ? sorted[sorted.length - 1].quantity : 0
}

/**
 * Exactly how many pieces a COLLECTION can be ordered in, ascending.
 *
 * The ladder is the whole answer: a quantity with no rung has no price, so it
 * cannot be bought. Callers use this to *say* so — "choose 2, 3 or 6 items"
 * beats a 2–6 range that silently refuses 4 and 5. Empty for the other kinds,
 * which are bounded by a range rather than by a set.
 */
export function pricedQuantities(offer: PublicOffer): number[] {
  if (offer.kind !== 'COLLECTION') return []
  return normalizeTiers(offer.tiers)
    .filter((tier) => tier.priceCents > 0)
    .map((tier) => tier.quantity)
}

/**
 * The piece-count bounds a buyer must stay inside.
 *
 * A COLLECTION is bounded by its ladder — there is no price outside it, so the
 * offer's own min/max cannot widen it and are not consulted — while an ALACARTE
 * offer is bounded only by whatever the merchant typed.
 */
export function quantityBounds(offer: PublicOffer): {
  min: number
  max: number
} {
  if (offer.kind === 'COLLECTION') {
    return {
      min: minTierQuantity(offer.tiers),
      max: maxTierQuantity(offer.tiers),
    }
  }
  return {
    min: Math.max(1, offer.minQuantity || 1),
    max: offer.maxQuantity || 0,
  }
}

export interface OfferQuote {
  /** What these goods list for at their own variant prices. */
  regularCents: number
  /** What the offer charges for them. */
  goodsCents: number
  /** regularCents - goodsCents, never negative. */
  savingCents: number
  /** Total pieces, which is what the ladder and promotions key off. */
  quantity: number
  /** Set when the selection cannot be priced; goodsCents is meaningless then. */
  error: string | null
}

/**
 * Price a buyer's selection against an offer.
 *
 * Takes the unit prices as a lookup rather than reading them itself, so the
 * server can pass live database prices and the browser can pass the ones it was
 * rendered with. Same rule, same arithmetic, two sources of truth for the
 * inputs — and only the server's inputs decide what is charged.
 *
 * A selection naming a variant that is not in the map is refused rather than
 * skipped: silently dropping a line would produce a cheaper, wrong total.
 */
export function quoteOffer(
  offer: PublicOffer,
  selections: OfferSelectionItem[],
  unitPriceCents: (variantId: string) => number | null
): OfferQuote {
  const empty: OfferQuote = {
    regularCents: 0,
    goodsCents: 0,
    savingCents: 0,
    quantity: 0,
    error: null,
  }

  if (selections.length === 0) {
    return { ...empty, error: 'Please choose at least one item.' }
  }

  let regularCents = 0
  let quantity = 0

  for (const selection of selections) {
    const unit = unitPriceCents(selection.variantId)
    if (unit === null) {
      return { ...empty, error: 'One of the chosen items is unavailable.' }
    }
    const lineQuantity = Math.max(1, Math.round(selection.quantity))
    regularCents += unit * lineQuantity
    quantity += lineQuantity
  }

  const bounds = quantityBounds(offer)
  if (quantity < bounds.min) {
    return {
      ...empty,
      quantity,
      error: `Please choose at least ${bounds.min} item${bounds.min === 1 ? '' : 's'}.`,
    }
  }
  if (bounds.max > 0 && quantity > bounds.max) {
    return {
      ...empty,
      quantity,
      error: `You can order up to ${bounds.max} item${bounds.max === 1 ? '' : 's'}.`,
    }
  }

  // A COLLECTION is priced by the rung, not by what is in the basket — the
  // whole mechanic is that any three cost the same.
  if (offer.kind === 'COLLECTION') {
    const tierPrice = tierPriceFor(offer.tiers, quantity)
    if (tierPrice === null) {
      return {
        ...empty,
        quantity,
        error: 'No price is set for that many items.',
      }
    }
    return {
      regularCents,
      goodsCents: tierPrice,
      savingCents: Math.max(0, regularCents - tierPrice),
      quantity,
      error: null,
    }
  }

  const goodsCents = applyOfferPricing(offer.pricing, regularCents)
  return {
    regularCents,
    goodsCents,
    savingCents: Math.max(0, regularCents - goodsCents),
    quantity,
    error: null,
  }
}

/**
 * The selection a FIXED offer implies once variants are chosen.
 *
 * A FIXED offer's contents are the merchant's, not the buyer's — all the buyer
 * picks is which variant of each line. `chosen` maps a line index to a variant
 * id; a pinned line ignores it, and a line with exactly one variant needs no
 * choice at all.
 */
export function fixedSelection(
  offer: PublicOffer,
  chosen: Record<number, string | undefined>
): OfferSelectionItem[] | null {
  const out: OfferSelectionItem[] = []

  for (const [index, line] of offer.items.entries()) {
    const variantId =
      line.pinnedVariantId ??
      chosen[index] ??
      (line.variants.length === 1 ? line.variants[0].id : null)

    if (!variantId) return null
    out.push({
      productId: line.productId,
      variantId,
      quantity: Math.max(1, line.quantity),
    })
  }

  return out
}

/**
 * Whether what this offer costs depends on which variant the buyer picks.
 *
 * True when a headline price is a *starting* price rather than the price:
 * a Large that costs more than a Small makes "৳900" a half-truth, and a buyer
 * who reads it as the price and is charged ৳1,100 at the summary has been
 * misled by the page. The callers use it to say "from ৳900" instead.
 *
 * A FIXED total covers whatever is in the set, and a COLLECTION is priced by
 * its ladder, so in both the buyer's variant choice cannot move the total.
 */
export function priceVariesByVariant(offer: PublicOffer): boolean {
  if (offer.kind === 'COLLECTION') return false
  if (offer.pricing.mode === 'FIXED') return false

  if (offer.kind === 'ALACARTE') {
    // The pool is priced piece by piece, so any spread across it — between two
    // products or between one product's sizes — moves the total.
    const prices = offer.pool.flatMap((line) =>
      line.variants
        .filter((variant) => variant.available)
        .map((variant) => variant.priceCents)
    )
    return new Set(prices).size > 1
  }

  return offer.items.some((line) => {
    if (line.pinnedVariantId) return false
    const prices = line.variants
      .filter((variant) => variant.available)
      .map((variant) => variant.priceCents)
    return new Set(prices).size > 1
  })
}

/**
 * What the page leads with for an offer, before the buyer touches anything.
 *
 * For FIXED that is the real total. For COLLECTION it is the cheapest rung —
 * the least a buyer could pay. For ALACARTE it is the cheapest thing in the
 * pool at the minimum quantity, with the offer's discount applied to *that*
 * basket: discounting one item by a whole basket's discount would advertise a
 * bundle for less than any of its own contents.
 */
export function headlinePrice(offer: PublicOffer): number {
  if (offer.kind === 'COLLECTION') {
    const sorted = normalizeTiers(offer.tiers)
    return sorted.length > 0 ? sorted[0].priceCents : 0
  }

  if (offer.kind === 'ALACARTE') {
    const prices = offer.pool.flatMap((line) =>
      line.variants.filter((v) => v.available).map((v) => v.priceCents)
    )
    if (prices.length === 0) return 0
    const minQuantity = Math.max(1, offer.minQuantity || 1)
    return applyOfferPricing(offer.pricing, Math.min(...prices) * minQuantity)
  }

  const regular = offer.items.reduce((total, line) => {
    const preferred =
      line.variants.find((v) => v.id === line.pinnedVariantId) ??
      line.variants.find((v) => v.available) ??
      line.variants[0]
    return total + (preferred?.priceCents ?? 0) * Math.max(1, line.quantity)
  }, 0)

  return applyOfferPricing(offer.pricing, regular)
}
