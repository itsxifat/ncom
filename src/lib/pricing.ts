import { allocate, applyBps, clampNonNegative, taxFromInclusive } from './money'

/**
 * The pricing engine: turns a set of cart lines plus the rules that apply to
 * them into an exact monetary breakdown.
 *
 * Deliberately pure — no database, no I/O, no clock. Every input is passed in.
 * Pricing is where money bugs live, and a function that can be exercised with
 * a literal object is one that can actually be tested against the awkward
 * cases (a percentage discount that doesn't divide evenly, a tax-inclusive
 * store shipping to a tax-free country, a BXGY promotion on a single line).
 * The service wrapper in server/services/pricingService.ts does the loading.
 *
 * ORDER OF OPERATIONS — this sequence is the specification, and changing it
 * changes what customers are charged:
 *
 *   1. Line subtotals            unit price x quantity
 *   2. Discounts                 allocated across eligible lines
 *   3. Shipping                  the chosen rate, or zero if free-shipping
 *   4. Tax                       on (subtotal - discount), + shipping if taxed
 *   5. Total                     assembled from the above
 *
 * Discounts must precede tax: taxing the pre-discount amount overcharges, and
 * in most jurisdictions is simply wrong — tax is owed on what was actually
 * paid. Allocation must precede tax as well, because tax is per-line (rates
 * can differ by product) and cannot be derived from an order-level total.
 */

// ── Inputs ───────────────────────────────────────────────────────────────

export interface PricingLine {
  id: string
  variantId: string
  productId: string
  quantity: number
  unitPriceCents: number
  isTaxable: boolean
  taxCode: string | null
  requiresShipping: boolean
  weightGrams: number
  /** Collection ids this product belongs to, for scoped discounts. */
  collectionIds: string[]
  /**
   * Already given away, so nothing may be discounted off it twice.
   *
   * A gift line is worth its list price on the subtotal and is cancelled out by
   * its own discount; letting a code take a further percentage off it would
   * push the order total below what the customer actually owes.
   */
  isGift?: boolean
}

export interface PricingDiscount {
  id: string
  code: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING' | 'BUY_X_GET_Y'
  valueBps: number | null
  valueCents: number | null
  /** A ceiling on what a percentage may take off. Null is no ceiling. */
  maxDiscountCents?: number | null
  appliesTo: 'ALL' | 'PRODUCTS' | 'COLLECTIONS' | 'VARIANTS'
  targetProductIds: string[]
  targetCollectionIds: string[]
  /** Size-level targeting: the M and the L are on offer, the XL is not. */
  targetVariantIds?: string[]
  /** Carved back out of whatever the scope above selected. */
  excludedProductIds?: string[]
  excludedVariantIds?: string[]
  minimumSubtotalCents: number | null
  minimumQuantity: number | null
  buyQuantity: number | null
  getQuantity: number | null
}

export interface PricingTaxRate {
  name: string
  rateBps: number
  appliesToShipping: boolean
  /** When set, only lines carrying this tax code use the rate. */
  taxCode: string | null
}

export interface PricingShippingRate {
  id: string
  name: string
  priceCents: number
}

export interface PricingInput {
  lines: PricingLine[]
  discount: PricingDiscount | null
  shippingRate: PricingShippingRate | null
  taxRates: PricingTaxRate[]
  /** Catalog prices already include tax; back it out rather than adding it. */
  pricesIncludeTax: boolean
  taxesIncludedInShipping: boolean
}

// ── Outputs ──────────────────────────────────────────────────────────────

export interface TaxLine {
  title: string
  rateBps: number
  amountCents: number
}

export interface PricedLine {
  id: string
  variantId: string
  productId: string
  quantity: number
  unitPriceCents: number
  /** unit price x quantity, before any discount. */
  subtotalCents: number
  discountCents: number
  taxCents: number
  taxLines: TaxLine[]
  /** What this line contributes to the order total. */
  totalCents: number
}

export interface PricingResult {
  lines: PricedLine[]
  subtotalCents: number
  discountTotalCents: number
  shippingTotalCents: number
  taxTotalCents: number
  totalCents: number
  totalWeightGrams: number
  /** Why a submitted code was ignored, for the storefront to surface. */
  discountRejectionReason: string | null
}

// ── Engine ───────────────────────────────────────────────────────────────

export function priceCart(input: PricingInput): PricingResult {
  const { lines, discount, shippingRate, taxRates, pricesIncludeTax } = input

  // 1. Line subtotals.
  const subtotals = lines.map((line) => line.unitPriceCents * line.quantity)
  const subtotalCents = subtotals.reduce((sum, value) => sum + value, 0)
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)

  // 2. Discounts.
  const evaluated = evaluateDiscount(lines, discount)
  const activeDiscount = evaluated.rejection ? null : discount
  const discountPerLine = evaluated.perLine
  const discountTotalCents = evaluated.totalCents
  const rejection = evaluated.rejection

  // 3. Shipping.
  const shippingRequired = lines.some((line) => line.requiresShipping)
  const freeShipping = activeDiscount?.type === 'FREE_SHIPPING'
  const shippingTotalCents =
    !shippingRequired || freeShipping ? 0 : (shippingRate?.priceCents ?? 0)

  // 4. Tax, per line, on the discounted amount.
  const pricedLines: PricedLine[] = lines.map((line, index) => {
    const discountCents = discountPerLine[index]
    const taxableBase = clampNonNegative(subtotals[index] - discountCents)

    const applicableRates = line.isTaxable
      ? taxRates.filter(
          (rate) => rate.taxCode === null || rate.taxCode === line.taxCode
        )
      : []

    const taxLines: TaxLine[] = applicableRates.map((rate) => ({
      title: rate.name,
      rateBps: rate.rateBps,
      amountCents: pricesIncludeTax
        ? taxFromInclusive(taxableBase, rate.rateBps)
        : applyBps(taxableBase, rate.rateBps),
    }))

    const taxCents = taxLines.reduce((sum, tax) => sum + tax.amountCents, 0)

    return {
      id: line.id,
      variantId: line.variantId,
      productId: line.productId,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      subtotalCents: subtotals[index],
      discountCents,
      taxCents,
      taxLines,
      // With inclusive pricing the tax is already inside the subtotal, so
      // adding it again would double-charge.
      totalCents: pricesIncludeTax ? taxableBase : taxableBase + taxCents,
    }
  })

  let taxTotalCents = pricedLines.reduce((sum, line) => sum + line.taxCents, 0)

  // Shipping tax, where the jurisdiction charges it.
  if (shippingTotalCents > 0) {
    const shippingRates = taxRates.filter((rate) => rate.appliesToShipping)
    for (const rate of shippingRates) {
      taxTotalCents += input.taxesIncludedInShipping
        ? taxFromInclusive(shippingTotalCents, rate.rateBps)
        : applyBps(shippingTotalCents, rate.rateBps)
    }
  }

  // 5. Totals.
  const goodsTotal = clampNonNegative(subtotalCents - discountTotalCents)
  const totalCents = pricesIncludeTax
    ? goodsTotal + shippingTotalCents
    : goodsTotal + shippingTotalCents + taxTotalCents

  return {
    lines: pricedLines,
    subtotalCents,
    discountTotalCents,
    shippingTotalCents,
    taxTotalCents,
    totalCents,
    totalWeightGrams: lines.reduce(
      (sum, line) => sum + line.weightGrams * line.quantity,
      0
    ),
    discountRejectionReason: rejection,
  }
}

// ── Discount helpers ─────────────────────────────────────────────────────

export interface DiscountEvaluation {
  /** What each line, in order, has taken off it. Sums to `totalCents`. */
  perLine: number[]
  totalCents: number
  /** Why the code earned nothing, or null when it applied. */
  rejection: string | null
}

/**
 * What a discount is worth against exactly these lines.
 *
 * Split out of `priceCart` because three callers have to reach the same answer
 * and one of them is not pricing a cart at all: the order editor revalidates a
 * code against a basket the merchant just changed on the phone, and has no
 * shipping rate or tax table in hand at that moment. A second implementation of
 * "does this code still qualify" is how a customer gets told yes on the
 * storefront and no on the callback.
 */
export function evaluateDiscount(
  lines: PricingLine[],
  discount: PricingDiscount | null
): DiscountEvaluation {
  const subtotals = lines.map((line) => line.unitPriceCents * line.quantity)
  const subtotalCents = subtotals.reduce((sum, value) => sum + value, 0)
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)

  const eligibility = lines.map((line) => isLineEligible(line, discount))
  const eligibleSubtotal = subtotals.reduce(
    (sum, value, index) => (eligibility[index] ? sum + value : sum),
    0
  )

  const rejection = discount
    ? rejectionReason(discount, subtotalCents, totalQuantity, eligibleSubtotal)
    : null

  const perLine = allocateDiscount(
    rejection ? null : discount,
    lines,
    subtotals,
    eligibility,
    eligibleSubtotal
  )

  return {
    perLine,
    totalCents: perLine.reduce((sum, value) => sum + value, 0),
    rejection,
  }
}

/** The rejection reason in the merchant's and the shopper's language. */
export function discountRejectionMessage(reason: string | null): string | null {
  switch (reason) {
    case 'MINIMUM_SUBTOTAL_NOT_MET':
      return 'This basket is below the minimum spend for that code.'
    case 'MINIMUM_QUANTITY_NOT_MET':
      return 'This basket has too few items for that code.'
    case 'NO_ELIGIBLE_ITEMS':
      return 'That code does not apply to anything in this basket.'
    default:
      return reason
  }
}

function isLineEligible(
  line: PricingLine,
  discount: PricingDiscount | null
): boolean {
  if (!discount) return false

  // Something already given away cannot be discounted again — see the note on
  // PricingLine.isGift.
  if (line.isGift) return false

  // Exclusions are checked after the scope below picks the line up, so
  // "everything except the XL" is one rule rather than a list of every size
  // that *is* on offer.
  if (discount.excludedProductIds?.includes(line.productId)) return false
  if (discount.excludedVariantIds?.includes(line.variantId)) return false

  switch (discount.appliesTo) {
    case 'ALL':
      return true
    case 'PRODUCTS':
      return discount.targetProductIds.includes(line.productId)
    case 'COLLECTIONS':
      return line.collectionIds.some((id) =>
        discount.targetCollectionIds.includes(id)
      )
    case 'VARIANTS':
      return (discount.targetVariantIds ?? []).includes(line.variantId)
  }
}

/**
 * Returns a human-readable reason the discount cannot apply, or null when it
 * can. Returning the reason rather than a boolean lets the storefront say
 * "spend $12 more to use SAVE10" instead of "invalid code", which is the
 * difference between a recovered cart and an abandoned one.
 */
function rejectionReason(
  discount: PricingDiscount,
  subtotalCents: number,
  totalQuantity: number,
  eligibleSubtotal: number
): string | null {
  if (
    discount.minimumSubtotalCents !== null &&
    subtotalCents < discount.minimumSubtotalCents
  ) {
    return 'MINIMUM_SUBTOTAL_NOT_MET'
  }

  if (
    discount.minimumQuantity !== null &&
    totalQuantity < discount.minimumQuantity
  ) {
    return 'MINIMUM_QUANTITY_NOT_MET'
  }

  if (discount.type !== 'FREE_SHIPPING' && eligibleSubtotal <= 0) {
    return 'NO_ELIGIBLE_ITEMS'
  }

  return null
}

/** A percentage discount's ceiling, when the campaign carries one. */
function capPercentage(
  amountCents: number,
  maxDiscountCents: number | null | undefined
): number {
  if (maxDiscountCents === null || maxDiscountCents === undefined) {
    return amountCents
  }
  return Math.min(amountCents, clampNonNegative(Math.round(maxDiscountCents)))
}

/**
 * Splits the discount across lines so the per-line amounts sum to exactly the
 * order-level discount.
 *
 * The allocation is not cosmetic: refunds are computed per line, so a discount
 * that doesn't reconcile against its lines produces refunds that don't
 * reconcile against the order. `allocate` distributes the remainder cents by
 * largest fractional claim — see lib/money.ts.
 */
function allocateDiscount(
  discount: PricingDiscount | null,
  lines: PricingLine[],
  subtotals: number[],
  eligibility: boolean[],
  eligibleSubtotal: number
): number[] {
  const zeros = lines.map(() => 0)
  if (!discount || discount.type === 'FREE_SHIPPING') return zeros

  if (discount.type === 'BUY_X_GET_Y') {
    return allocateBuyXGetY(discount, lines, eligibility)
  }

  if (eligibleSubtotal <= 0) return zeros

  const amount =
    discount.type === 'PERCENTAGE'
      ? // The cap is applied to the percentage, not to the whole discount: a
        // fixed-amount discount already *is* its own ceiling, and clamping it
        // here would silently shrink a "500 off" campaign that also happened
        // to carry a leftover cap from an earlier percentage one.
        capPercentage(
          applyBps(eligibleSubtotal, discount.valueBps ?? 0),
          discount.maxDiscountCents
        )
      : // A fixed-amount discount larger than the cart must not create a
        // negative total or a partial refund of money never taken.
        Math.min(discount.valueCents ?? 0, eligibleSubtotal)

  const weights = subtotals.map((value, index) =>
    eligibility[index] ? value : 0
  )
  const allocated = allocate(amount, weights)

  // allocate() spreads evenly when every weight is zero, which would put money
  // on ineligible lines; mask them back out.
  return allocated.map((value, index) => (eligibility[index] ? value : 0))
}

/**
 * Buy X get Y: the cheapest Y units among eligible lines become free, once per
 * complete X+Y group the cart can form.
 *
 * Discounting the cheapest units is the customer-favourable reading and the
 * one Shopify uses. Doing it per whole group stops a cart of 3 items claiming
 * a "buy 2 get 1" reward twice.
 */
function allocateBuyXGetY(
  discount: PricingDiscount,
  lines: PricingLine[],
  eligibility: boolean[]
): number[] {
  const result = lines.map(() => 0)
  const buy = discount.buyQuantity ?? 0
  const get = discount.getQuantity ?? 0
  if (buy <= 0 || get <= 0) return result

  // Expand to individual units so "cheapest N units" is exact even when one
  // line holds several.
  const units: { lineIndex: number; priceCents: number }[] = []
  lines.forEach((line, index) => {
    if (!eligibility[index]) return
    for (let i = 0; i < line.quantity; i++) {
      units.push({ lineIndex: index, priceCents: line.unitPriceCents })
    }
  })

  const groups = Math.floor(units.length / (buy + get))
  if (groups <= 0) return result

  const freeUnitCount = groups * get
  units.sort((a, b) => a.priceCents - b.priceCents)

  for (let i = 0; i < freeUnitCount; i++) {
    result[units[i].lineIndex] += units[i].priceCents
  }

  return result
}

/**
 * Picks the cheapest shipping rate whose price and weight bands both contain
 * the cart. Returns null when the destination has no matching rate, which the
 * checkout must treat as "we don't ship there" rather than as free shipping.
 */
export function selectShippingRate(
  rates: {
    id: string
    name: string
    priceCents: number
    minSubtotalCents: number | null
    maxSubtotalCents: number | null
    minWeightGrams: number | null
    maxWeightGrams: number | null
  }[],
  subtotalCents: number,
  totalWeightGrams: number
): PricingShippingRate | null {
  const eligible = rates.filter((rate) => {
    if (rate.minSubtotalCents !== null && subtotalCents < rate.minSubtotalCents)
      return false
    if (rate.maxSubtotalCents !== null && subtotalCents > rate.maxSubtotalCents)
      return false
    if (rate.minWeightGrams !== null && totalWeightGrams < rate.minWeightGrams)
      return false
    if (rate.maxWeightGrams !== null && totalWeightGrams > rate.maxWeightGrams)
      return false
    return true
  })

  if (eligible.length === 0) return null

  const cheapest = eligible.reduce((best, rate) =>
    rate.priceCents < best.priceCents ? rate : best
  )

  return {
    id: cheapest.id,
    name: cheapest.name,
    priceCents: cheapest.priceCents,
  }
}
