import type {
  OfferPricingRule,
  OfferTierChoice,
  PublicOffer,
  OfferSelectionItem,
  OfferVariantChoice,
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
      reward:
        tier.reward === 'PERCENT' ? ('PERCENT' as const) : ('PRICE' as const),
      priceCents: clampPositive(Math.round(tier.priceCents)),
      discountBps: clampPositive(Math.round(tier.discountBps)),
    }))
    .filter((tier) => (tier.reward === 'PERCENT' ? tier.discountBps > 0 : true))
    .sort((a, b) => a.quantity - b.quantity)
}

/**
 * What a COLLECTION offer charges for this many pieces, or null if it cannot
 * say.
 *
 * Two ladders, and the difference matters to the merchant's margin:
 *
 * EXACT is an exact-match ladder. The merchant priced 2, 3 and 5 pieces, and a
 * buyer asking for 4 has chosen something that was never given a price.
 * Returning null makes the caller refuse rather than invent a total — the
 * alternative is charging the 3-piece price for four pieces, which is a real
 * loss on every such order.
 *
 * THRESHOLD reads the ladder the way merchants describe it out loud: "3 for
 * 1000" covers a buyer taking four, who pays the rung plus one more at list.
 * The pieces that fall outside the rung are the *cheapest* ones — the buyer
 * gets the rung applied to the most expensive units, which is the same
 * customer-favourable reading the buy-X-get-Y allocator uses.
 *
 * `unitPrices` is every chosen unit's list price, one entry per piece, so the
 * overflow can be priced exactly rather than at an average.
 */
export function tierPriceFor(
  tiers: OfferTierChoice[],
  quantity: number,
  options: {
    mode?: PublicOffer['tierMode']
    regularCents?: number
    unitPrices?: number[]
  } = {}
): number | null {
  const ladder = normalizeTiers(tiers)
  const mode = options.mode ?? 'EXACT'
  const regular = clampPositive(Math.round(options.regularCents ?? 0))

  const rung =
    mode === 'THRESHOLD'
      ? [...ladder].reverse().find((tier) => tier.quantity <= quantity)
      : ladder.find((tier) => tier.quantity === quantity)

  if (!rung) return null

  // A percentage rung is a rate, not a total, so it needs no overflow handling
  // — it simply applies to everything the buyer picked.
  if (rung.reward === 'PERCENT') {
    return Math.max(
      0,
      regular - Math.round((regular * rung.discountBps) / BPS_DIVISOR)
    )
  }

  if (mode !== 'THRESHOLD' || rung.quantity === quantity) return rung.priceCents

  const overflow = quantity - rung.quantity
  const cheapest = [...(options.unitPrices ?? [])].sort((a, b) => a - b)
  const extras = cheapest
    .slice(0, overflow)
    .reduce((total, price) => total + clampPositive(price), 0)

  return rung.priceCents + extras
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
    .filter((tier) =>
      tier.reward === 'PERCENT' ? tier.discountBps > 0 : tier.priceCents > 0
    )
    .map((tier) => tier.quantity)
}

/** "2, 3 or 6" — a ladder's rungs, as a buyer would read them out. */
function listQuantities(quantities: number[]): string {
  if (quantities.length <= 1) return String(quantities[0] ?? '')
  const last = quantities[quantities.length - 1]
  return `${quantities.slice(0, -1).join(', ')} or ${last}`
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
      // A threshold ladder keeps working above its top rung — the extra pieces
      // are simply charged at list — so capping the basket at the last rung
      // would refuse orders the offer can price perfectly well. The offer's own
      // maximum still applies when the merchant set one.
      max:
        offer.tierMode === 'THRESHOLD'
          ? offer.maxQuantity || 0
          : maxTierQuantity(offer.tiers),
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
 * Takes the variants as a lookup rather than reading them itself, so the server
 * can pass live database rows and the browser can pass the ones it was rendered
 * with. Same rule, same arithmetic, two sources of truth for the inputs — and
 * only the server's inputs decide what is charged.
 *
 * A selection naming a variant that is not in the map is refused rather than
 * skipped: silently dropping a line would produce a cheaper, wrong total.
 *
 * Sizes carrying their own terms are priced apart from the rest and the offer's
 * own rule is applied only to what is left. That is the whole mechanism behind
 * "20% off the shirts, nothing off the XL": the XL's units are lifted out of
 * the discount base rather than discounted and then added back, which would
 * round differently and drift by a unit or two on a large basket.
 */
export function quoteOffer(
  offer: PublicOffer,
  selections: OfferSelectionItem[],
  variantLookup: (variantId: string) => OfferVariantChoice | null
): OfferQuote {
  const empty: OfferQuote = {
    regularCents: 0,
    goodsCents: 0,
    savingCents: 0,
    quantity: 0,
    error: null,
  }

  if (selections.length === 0) {
    // A sold-out line is not a choice the buyer failed to make. Offers stay on
    // the page when their goods run out, so without this the form asks someone
    // to pick an option it has already crossed out — which reads as a broken
    // page rather than as an empty shelf.
    const soldOut = (offer.kind === 'FIXED' ? offer.items : offer.pool).filter(
      (line) => !line.variants.some((variant) => variant.available)
    )
    const allSoldOut =
      offer.kind === 'FIXED'
        ? soldOut.length > 0
        : soldOut.length > 0 && soldOut.length === offer.pool.length

    if (allSoldOut) {
      return {
        ...empty,
        error:
          soldOut.length === 1
            ? `${soldOut[0]!.title} is out of stock.`
            : 'Everything in this offer is out of stock right now.',
      }
    }

    return {
      ...empty,
      error:
        offer.kind === 'FIXED'
          ? 'Please choose an option for each item.'
          : 'Please choose at least one item.',
    }
  }

  let regularCents = 0
  let quantity = 0
  /** Every chosen piece's list price, for a THRESHOLD ladder's overflow. */
  const unitPrices: number[] = []
  /** Regular totals split by the rule that prices them. */
  let plainRegular = 0
  const ruled: { rule: OfferPricingRule; regularCents: number }[] = []

  for (const selection of selections) {
    const variant = variantLookup(selection.variantId)
    if (!variant) {
      return { ...empty, error: 'One of the chosen items is unavailable.' }
    }
    const lineQuantity = Math.max(1, Math.round(selection.quantity))
    const lineRegular = variant.priceCents * lineQuantity

    regularCents += lineRegular
    quantity += lineQuantity
    for (let piece = 0; piece < lineQuantity; piece++) {
      unitPrices.push(variant.priceCents)
    }

    if (variant.pricing)
      ruled.push({ rule: variant.pricing, regularCents: lineRegular })
    else plainRegular += lineRegular
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
  // whole mechanic is that any three cost the same. Per-size terms cannot
  // apply here for the same reason: there is one price for the set, and a
  // size that must not be discounted is excluded from the pool instead.
  if (offer.kind === 'COLLECTION') {
    const tierPrice = tierPriceFor(offer.tiers, quantity, {
      mode: offer.tierMode,
      regularCents,
      unitPrices,
    })
    if (tierPrice === null) {
      // An exact ladder prices a set of quantities, not a range, so a buyer can
      // sit well inside `quantityBounds` and still be standing somewhere nobody
      // priced. Naming the rungs turns a dead end into a choice — the form has
      // just let them build a basket it refuses, and "no price is set" does not
      // tell them what would work. `pricedQuantities` exists for exactly this.
      const rungs = pricedQuantities(offer)
      return {
        ...empty,
        quantity,
        error:
          rungs.length > 0
            ? `This offer is sold in sets of ${listQuantities(rungs)} — you have ${quantity}.`
            : 'No price is set for that many items.',
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

  // A flat bundle total covers whatever is in the set, so a per-size rate has
  // nothing to modify — the merchant already named the only price there is.
  if (offer.pricing.mode === 'FIXED') {
    const goodsCents = applyOfferPricing(offer.pricing, regularCents)
    return {
      regularCents,
      goodsCents,
      savingCents: Math.max(0, regularCents - goodsCents),
      quantity,
      error: null,
    }
  }

  const goodsCents =
    applyOfferPricing(offer.pricing, plainRegular) +
    ruled.reduce(
      (total, entry) =>
        total + applyOfferPricing(entry.rule, entry.regularCents),
      0
    )

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

  // A size priced on its own terms moves the total by itself, even where every
  // variant lists for the same money.
  const ruled = [...offer.items, ...offer.pool].some((line) =>
    line.variants.some((variant) => variant.pricing !== null)
  )
  if (ruled) return true

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
    const first = sorted[0]
    if (!first) return 0
    if (first.reward !== 'PERCENT') return first.priceCents

    // A percentage rung has no total of its own, so the cheapest way to fill it
    // is the cheapest thing in the pool taken that many times.
    const prices = offer.pool.flatMap((line) =>
      line.variants.filter((v) => v.available).map((v) => v.priceCents)
    )
    if (prices.length === 0) return 0
    const regular = Math.min(...prices) * first.quantity
    return Math.max(
      0,
      regular - Math.round((regular * first.discountBps) / BPS_DIVISOR)
    )
  }

  if (offer.kind === 'ALACARTE') {
    const cheapest = offer.pool
      .flatMap((line) => line.variants.filter((v) => v.available))
      .reduce<OfferVariantChoice | null>(
        (best, variant) =>
          !best || variant.priceCents < best.priceCents ? variant : best,
        null
      )
    if (!cheapest) return 0
    const minQuantity = Math.max(1, offer.minQuantity || 1)
    return applyOfferPricing(
      cheapest.pricing ?? offer.pricing,
      cheapest.priceCents * minQuantity
    )
  }

  // A flat bundle price covers the set whatever is in it, so per-size terms
  // cannot move it and the whole regular total goes through the offer's rule.
  if (offer.pricing.mode === 'FIXED') {
    return applyOfferPricing(offer.pricing, regularOf(offer.items))
  }

  let plain = 0
  let ruled = 0
  for (const line of offer.items) {
    const variant = preferredVariant(line)
    const lineRegular = (variant?.priceCents ?? 0) * Math.max(1, line.quantity)
    if (variant?.pricing)
      ruled += applyOfferPricing(variant.pricing, lineRegular)
    else plain += lineRegular
  }

  return applyOfferPricing(offer.pricing, plain) + ruled
}

/** The variant a line leads with: the pin, else the first sellable one. */
function preferredVariant(line: PublicOffer['items'][number]) {
  return (
    line.variants.find((variant) => variant.id === line.pinnedVariantId) ??
    line.variants.find((variant) => variant.available) ??
    line.variants[0] ??
    null
  )
}

function regularOf(lines: PublicOffer['items']): number {
  return lines.reduce(
    (total, line) =>
      total +
      (preferredVariant(line)?.priceCents ?? 0) * Math.max(1, line.quantity),
    0
  )
}
