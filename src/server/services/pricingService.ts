import 'server-only'
import { prisma } from '@/server/db/client'
import {
  priceCart,
  selectShippingRate,
  type PricingDiscount,
  type PricingLine,
  type PricingResult,
  type PricingShippingRate,
  type PricingTaxRate,
} from '@/lib/pricing'

/**
 * Loads everything the pure pricing engine needs and runs it.
 *
 * The split matters: all database access and all "which rules apply" decisions
 * live here, and all arithmetic lives in lib/pricing.ts where it can be tested
 * without a database. Nothing in this file does money maths.
 *
 * This is the single source of truth for what a cart costs. The storefront
 * calls it to display totals and checkout calls it again to write the order —
 * the displayed price is never carried forward, it is always recomputed, so a
 * tampered client cannot influence what is charged.
 */

export interface PricedCart extends PricingResult {
  currencyCode: string
  availableShippingRates: PricingShippingRate[]
  /** Set when the destination has no matching rate — checkout must block. */
  shippingUnavailable: boolean
}

export async function priceCartById(
  cartId: string,
  options: { shippingRateId?: string | null } = {}
): Promise<PricedCart> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      lines: {
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  collections: { select: { collectionId: true } },
                },
              },
            },
          },
        },
      },
      organization: {
        select: {
          id: true,
          settings: {
            select: {
              currencyCode: true,
              pricesIncludeTax: true,
              taxesIncludedInShipping: true,
            },
          },
        },
      },
    },
  })

  if (!cart) throw new Error('Cart not found')

  const settings = cart.organization.settings
  const currencyCode = settings?.currencyCode ?? cart.currencyCode

  // Prices come off the variant, never off CartLine.unitPriceCents — that
  // column records what the shopper was last shown, so that the storefront can
  // tell them the price changed, but it is not authoritative for charging.
  const lines: PricingLine[] = cart.lines.map((line) => ({
    id: line.id,
    variantId: line.variantId,
    productId: line.variant.product.id,
    quantity: line.quantity,
    unitPriceCents: line.variant.priceCents,
    isTaxable: line.variant.isTaxable,
    taxCode: line.variant.taxCode,
    requiresShipping: line.variant.requiresShipping,
    weightGrams: line.variant.weightGrams,
    collectionIds: line.variant.product.collections.map(
      (link) => link.collectionId
    ),
  }))

  const shippingAddress = parseAddress(cart.shippingAddress)
  const countryCode = shippingAddress?.countryCode ?? null
  const provinceCode = shippingAddress?.provinceCode ?? null

  const [discount, taxRates, shippingRates] = await Promise.all([
    loadDiscount(cart.organizationId, cart.discountCode, cart.storeId),
    loadTaxRates(cart.organizationId, countryCode, provinceCode),
    loadShippingRates(cart.organizationId, countryCode),
  ])

  const subtotalEstimate = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0
  )
  const weightEstimate = lines.reduce(
    (sum, line) => sum + line.weightGrams * line.quantity,
    0
  )

  const eligibleRates = shippingRates.filter((rate) => {
    if (
      rate.minSubtotalCents !== null &&
      subtotalEstimate < rate.minSubtotalCents
    )
      return false
    if (
      rate.maxSubtotalCents !== null &&
      subtotalEstimate > rate.maxSubtotalCents
    )
      return false
    if (rate.minWeightGrams !== null && weightEstimate < rate.minWeightGrams)
      return false
    if (rate.maxWeightGrams !== null && weightEstimate > rate.maxWeightGrams)
      return false
    return true
  })

  const requestedRateId = options.shippingRateId ?? cart.shippingRateId
  const chosenRate =
    eligibleRates.find((rate) => rate.id === requestedRateId) ?? null

  // An explicitly chosen rate wins; otherwise fall back to the cheapest
  // eligible one so a cart always shows a plausible total before the buyer
  // reaches the shipping step.
  const shippingRate: PricingShippingRate | null = chosenRate
    ? {
        id: chosenRate.id,
        name: chosenRate.name,
        priceCents: chosenRate.priceCents,
      }
    : selectShippingRate(shippingRates, subtotalEstimate, weightEstimate)

  const requiresShipping = lines.some((line) => line.requiresShipping)

  const result = priceCart({
    lines,
    discount,
    shippingRate,
    taxRates,
    pricesIncludeTax: settings?.pricesIncludeTax ?? false,
    taxesIncludedInShipping: settings?.taxesIncludedInShipping ?? false,
  })

  return {
    ...result,
    currencyCode,
    availableShippingRates: eligibleRates.map((rate) => ({
      id: rate.id,
      name: rate.name,
      priceCents: rate.priceCents,
    })),
    // Only a blocker once we know where we are shipping to; before the address
    // step there is nothing to be unavailable for.
    shippingUnavailable:
      requiresShipping && countryCode !== null && shippingRate === null,
  }
}

/**
 * The rule behind a typed code, ready to price with — or null if it cannot be
 * used right now.
 *
 * Exported because three callers have to answer the identical question and must
 * answer it identically: the cart, the landing-page order route, and the order
 * editor revalidating a code against a basket a merchant just changed on the
 * phone. A code that is honoured at checkout and refused on an edit — or the
 * reverse — is a conversation the merchant cannot win.
 *
 * `storeId` narrows to campaigns that storefront is part of. A discount naming
 * no stores runs everywhere, which is what every existing row means and what a
 * merchant with one shop expects.
 */
export async function loadDiscount(
  organizationId: string,
  code: string | null,
  storeId?: string | null
): Promise<PricingDiscount | null> {
  if (!code) return null

  const now = new Date()

  const discountCode = await prisma.discountCode.findFirst({
    where: {
      // Codes are compared case-insensitively: shoppers type "save10" for a
      // code printed as "SAVE10", and rejecting that is a support ticket.
      code: { equals: code, mode: 'insensitive' },
      discount: {
        organizationId,
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    },
    include: { discount: true },
  })

  if (!discountCode) return null

  const discount = discountCode.discount

  // A code past its redemption cap prices as if absent; the cart layer reports
  // it separately so the shopper is told rather than silently overcharged.
  if (
    discount.usageLimit !== null &&
    discount.usageCount >= discount.usageLimit
  ) {
    return null
  }

  // An empty list is "every store", so it is not a filter — only a non-empty
  // one is, and then only when we know which store is asking.
  if (
    storeId &&
    discount.storeIds.length > 0 &&
    !discount.storeIds.includes(storeId)
  ) {
    return null
  }

  return {
    id: discount.id,
    code: discountCode.code,
    type: discount.type,
    valueBps: discount.valueBps,
    valueCents: discount.valueCents,
    maxDiscountCents: discount.maxDiscountCents,
    appliesTo: discount.appliesTo,
    targetProductIds: discount.targetProductIds,
    targetCollectionIds: discount.targetCollectionIds,
    targetVariantIds: discount.targetVariantIds,
    excludedProductIds: discount.excludedProductIds,
    excludedVariantIds: discount.excludedVariantIds,
    minimumSubtotalCents: discount.minimumSubtotalCents,
    minimumQuantity: discount.minimumQuantity,
    buyQuantity: discount.buyQuantity,
    getQuantity: discount.getQuantity,
  }
}

/**
 * The tax rates that apply to a destination.
 *
 * Exported because the order editor has to answer the same question when a
 * merchant adds a line to a placed order, and the province-preference rule
 * below is exactly the kind of thing that goes wrong when it is written twice.
 */
export async function loadTaxRates(
  organizationId: string,
  countryCode: string | null,
  provinceCode: string | null
): Promise<PricingTaxRate[]> {
  // With no destination there is nothing to tax yet — showing a guessed tax
  // that changes at the address step reads as a bait-and-switch.
  if (!countryCode) return []

  const rates = await prisma.taxRate.findMany({
    where: {
      organizationId,
      countryCode,
      // A province-specific rate applies only to that province; a null
      // province is the country-wide fallback.
      OR: [{ provinceCode: null }, { provinceCode }],
    },
  })

  // Prefer the province-specific rate when both exist, so a country rate and a
  // state rate for the same tax code don't stack into a double charge.
  const hasProvinceRate = rates.some(
    (rate) => rate.provinceCode === provinceCode
  )
  const applicable = hasProvinceRate
    ? rates.filter((rate) => rate.provinceCode === provinceCode)
    : rates

  return applicable.map((rate) => ({
    name: rate.name,
    rateBps: rate.rateBps,
    appliesToShipping: rate.appliesToShipping,
    taxCode: rate.taxCode,
  }))
}

async function loadShippingRates(
  organizationId: string,
  countryCode: string | null
) {
  const zones = await prisma.shippingZone.findMany({
    where: { organizationId },
    include: { rates: { orderBy: { position: 'asc' } } },
  })

  const matching = countryCode
    ? zones.filter(
        (zone) =>
          zone.countryCodes.includes(countryCode) ||
          // An empty country list is the "rest of world" catch-all zone.
          zone.countryCodes.length === 0
      )
    : zones

  return matching.flatMap((zone) => zone.rates)
}

/** Reads a country/province out of a stored address JSON blob. */
export function parseAddress(
  value: unknown
): { countryCode: string; provinceCode: string | null } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const countryCode = record.countryCode

  if (typeof countryCode !== 'string' || countryCode.length !== 2) return null

  return {
    countryCode,
    provinceCode:
      typeof record.provinceCode === 'string' ? record.provinceCode : null,
  }
}
