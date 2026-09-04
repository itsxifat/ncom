import 'server-only'
import { getProductsByIds, isCatalogError } from '@/server/catalog'
import { getPublicOffers } from './offerService'
import { loadDiscount } from './pricingService'
import {
  discountRejectionMessage,
  evaluateDiscount,
  type PricingLine,
} from '@/lib/pricing'
import { quoteOffer } from '@/lib/offers/pricing'
import { allocate, clampNonNegative } from '@/lib/money'
import type { OfferVariantChoice, PublicOffer } from '@/lib/offers/types'

/**
 * What an edited order costs.
 *
 * Editing a placed order used to be arithmetic on quantities: lines changed,
 * the subtotal followed, and every discount was carried across untouched. That
 * quietly produced two wrong answers on the calls merchants actually take.
 *
 *   "Make it three instead of two" — the bundle price was for two. The offer
 *   either still applies at its three-item terms or does not apply at all, and
 *   carrying the two-item saving forward charges the wrong money either way.
 *
 *   "I used the code SAVE500" — the code had a ৳2000 minimum and the customer
 *   has just dropped a line. Carrying the ৳500 hands out a discount the
 *   campaign never offered; ignoring the code entirely on an order that still
 *   qualifies takes one away that it did.
 *
 * So the whole basket is re-quoted from the rules, exactly as the storefront
 * would have quoted it, and the merchant is shown the answer before they save.
 * This module is that re-quote. It writes nothing.
 *
 * One deliberate exception to "re-derive everything": a code that no longer
 * exists cannot be judged, so whatever it was worth is carried forward rather
 * than dropped. Withdrawing a discount because the campaign was deleted last
 * month — during a phone call about a completely different change — is not a
 * conversation any merchant can win.
 *
 * Line prices are taken as given. A merchant who has agreed a price on the
 * phone has agreed it, and every figure below — the subtotal, what a gift was
 * worth, the basket a minimum-spend code is judged against — is derived from
 * the prices on the lines rather than from the catalogue. The one rule that
 * cannot survive that is the offer's; see priceAgainstOffer.
 */

export interface OrderEditQuoteLine {
  /** Whatever the caller keys lines by: an OrderLine id, or a draft key. */
  key: string
  productId: string | null
  variantId: string | null
  quantity: number
  unitPriceCents: number
  isGift: boolean
}

export interface OrderEditQuoteInput {
  organizationId: string
  storeId: string | null
  /** The campaign this order came from, if any. */
  pageId: string | null
  offerKey: string | null
  lines: OrderEditQuoteLine[]
  /**
   * The code to judge. `undefined` keeps whatever the order already carries;
   * a string tries that code; `null` removes the code entirely.
   */
  discountCode?: string | null
  /** What the order's code was worth when it was placed, for the fallback. */
  previousCouponCents: number
  previousCouponCode: string | null
  manualDiscountCents: number
  shippingCents: number
  shippingWaived: boolean
}

export interface OrderEditQuote {
  subtotalCents: number

  /** Line ids → what comes off that line. Gift lines carry their whole value. */
  lineDiscounts: Record<string, number>

  giftDiscountCents: number
  offerDiscountCents: number
  offerLabel: string | null
  /** Why the offer no longer prices this basket, in the merchant's language. */
  offerNote: string | null

  couponCode: string | null
  couponDiscountCents: number
  /** Why the code earns nothing, or that it could not be checked. */
  couponNote: string | null

  manualDiscountCents: number
  discountTotalCents: number

  shippingTotalCents: number
  totalCents: number
}

export async function quoteOrderEdit(
  input: OrderEditQuoteInput
): Promise<OrderEditQuote> {
  const lines = input.lines.filter((line) => line.quantity > 0)
  const sold = lines.filter((line) => !line.isGift)

  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0
  )
  const giftDiscountCents = lines
    .filter((line) => line.isGift)
    .reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0)

  const offer = await resolveOffer(input.pageId, input.offerKey)
  const offerQuote = offer ? priceAgainstOffer(offer, sold) : null

  const offerDiscountCents = offerQuote?.savingCents ?? 0

  // What the goods are being sold for once the offer has had its say. The code
  // is judged against this rather than the list price, because that is what the
  // customer is being asked to pay — and it is what the storefront would have
  // judged it against.
  const soldRegular = sold.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0
  )
  const soldGoods = clampNonNegative(soldRegular - offerDiscountCents)

  const coupon = await resolveCoupon(input, sold, soldRegular, soldGoods)

  const manualDiscountCents = clampNonNegative(
    Math.round(input.manualDiscountCents)
  )

  // Everything a line has taken off it, for the OrderLine rows. The offer
  // saving and the manual discount stay at the order level: neither belongs to
  // a particular line, and inventing an allocation for them would make refunds
  // reconcile against numbers nobody agreed to.
  const lineDiscounts: Record<string, number> = {}
  for (const line of lines) {
    lineDiscounts[line.key] = line.isGift
      ? line.unitPriceCents * line.quantity
      : 0
  }
  for (const [index, line] of sold.entries()) {
    lineDiscounts[line.key] = coupon.perLine[index] ?? 0
  }

  const discountTotalCents = Math.min(
    subtotalCents,
    giftDiscountCents +
      offerDiscountCents +
      coupon.discountCents +
      manualDiscountCents
  )

  const shippingTotalCents = input.shippingWaived
    ? 0
    : clampNonNegative(Math.round(input.shippingCents))

  return {
    subtotalCents,
    lineDiscounts,
    giftDiscountCents,
    offerDiscountCents,
    offerLabel: offer?.label ?? null,
    offerNote: offerQuote?.note ?? null,
    couponCode: coupon.code,
    couponDiscountCents: coupon.discountCents,
    couponNote: coupon.note,
    manualDiscountCents,
    discountTotalCents,
    shippingTotalCents,
    totalCents: clampNonNegative(
      subtotalCents - discountTotalCents + shippingTotalCents
    ),
  }
}

/**
 * The offer this order was sold under, as it stands today.
 *
 * Null when the order was not a campaign sale, when the page has since been
 * deleted, or when the offer has been retired — in all three there is no rule
 * left to re-apply, and the order keeps whatever its lines say.
 */
async function resolveOffer(
  pageId: string | null,
  offerKey: string | null
): Promise<PublicOffer | null> {
  if (!pageId || !offerKey) return null

  try {
    const offers = await getPublicOffers(pageId)
    return offers.find((candidate) => candidate.key === offerKey) ?? null
  } catch {
    return null
  }
}

/**
 * Re-prices the edited basket against the offer it was sold under.
 *
 * A basket that has fallen outside the offer — three items where the ladder
 * prices two and four, a product the merchant has since removed from the pool —
 * earns nothing and says why. That is the honest answer: the customer is no
 * longer buying the thing the offer priced.
 */
function priceAgainstOffer(
  offer: PublicOffer,
  lines: OrderEditQuoteLine[]
): { savingCents: number; note: string | null } {
  const variants = new Map<string, OfferVariantChoice>()
  for (const line of [...offer.items, ...offer.pool]) {
    for (const variant of line.variants) variants.set(variant.id, variant)
  }

  const selections = lines
    .filter((line) => line.variantId && line.productId)
    .map((line) => ({
      productId: line.productId!,
      variantId: line.variantId!,
      quantity: line.quantity,
    }))

  if (selections.length === 0) {
    return { savingCents: 0, note: `Nothing here is part of ${offer.label}.` }
  }

  const outside = selections.find(
    (selection) => !variants.has(selection.variantId)
  )
  if (outside) {
    return {
      savingCents: 0,
      note: `${offer.label} no longer covers everything on this order, so it is priced at the normal prices.`,
    }
  }

  // A price set by hand is not a price this offer knows about.
  //
  // The saving below is derived from the catalogue — quoteOffer sums each
  // chosen variant's list price and takes the offer's price off that — while
  // the subtotal it gets subtracted from is derived from the order's own line
  // prices. The two only reconcile while they agree on what a unit costs. Once
  // a merchant has negotiated a line down, subtracting the catalogue saving
  // from the negotiated subtotal takes the same money off twice, and the clamp
  // on the total hides the overflow rather than failing loudly.
  //
  // So the offer stops pricing the basket and says so. The merchant is left
  // with the arithmetic they actually described: the prices they typed. (The
  // order-level "extra discount" is the lever for taking more off an offer
  // order without disturbing its saving.)
  const repriced = lines.find((line) => {
    if (!line.variantId) return false
    const variant = variants.get(line.variantId)
    return variant ? line.unitPriceCents !== variant.priceCents : false
  })
  if (repriced) {
    return {
      savingCents: 0,
      note: `${offer.label} prices these items itself, and one of them is no longer at its offer price — this order is priced at the prices on its lines.`,
    }
  }

  // A fixed bundle is a price for an exact set. A basket that is no longer that
  // set — the customer dropped the cap, or asked for a second shirt — is not
  // the thing the bundle priced, and charging the bundle price for it is wrong
  // in both directions: it hands over an extra item free, or it charges the
  // pair's price for one. The storefront can never post a partial set, so this
  // only bites on an edit, which is exactly where the customer is changing
  // their mind about what they are buying.
  if (offer.kind === 'FIXED') {
    const wanted = new Map<string, number>()
    for (const line of offer.items) {
      wanted.set(
        line.productId,
        (wanted.get(line.productId) ?? 0) + Math.max(1, line.quantity)
      )
    }

    const got = new Map<string, number>()
    for (const selection of selections) {
      got.set(
        selection.productId,
        (got.get(selection.productId) ?? 0) + selection.quantity
      )
    }

    const complete =
      wanted.size === got.size &&
      [...wanted].every(
        ([productId, quantity]) => got.get(productId) === quantity
      )

    if (!complete) {
      return {
        savingCents: 0,
        note: `${offer.label} is a price for an exact set, and this order is no longer that set — everything is at its normal price.`,
      }
    }
  }

  const quote = quoteOffer(
    offer,
    selections,
    (variantId) => variants.get(variantId) ?? null
  )

  if (quote.error) {
    return {
      savingCents: 0,
      note: `${offer.label} does not price this basket — ${quote.error.replace(/^Please /, '')}`,
    }
  }

  return { savingCents: Math.max(0, quote.savingCents), note: null }
}

interface ResolvedCoupon {
  code: string | null
  discountCents: number
  perLine: number[]
  note: string | null
}

async function resolveCoupon(
  input: OrderEditQuoteInput,
  sold: OrderEditQuoteLine[],
  soldRegular: number,
  soldGoods: number
): Promise<ResolvedCoupon> {
  const zeros = sold.map(() => 0)

  // `undefined` means "leave it as it was"; `null` means the merchant took it
  // off. Only the second clears a code, which is why they are distinguished
  // rather than both being falsy.
  const code =
    input.discountCode === undefined
      ? input.previousCouponCode
      : input.discountCode

  if (!code) return { code: null, discountCents: 0, perLine: zeros, note: null }

  const discount = await loadDiscount(input.organizationId, code, input.storeId)

  if (!discount) {
    // The campaign is gone, expired or fully redeemed. It cannot be judged, so
    // what it was worth is carried rather than withdrawn — but only for the
    // code the order already had. A merchant typing a *new* code that does not
    // resolve is told so rather than handed the old one's value.
    const previous = code === input.previousCouponCode
    return {
      code,
      discountCents: previous
        ? Math.min(clampNonNegative(input.previousCouponCents), soldGoods)
        : 0,
      perLine: zeros,
      note: previous
        ? `${code} is no longer running — its original discount has been kept.`
        : `${code} is not a valid code.`,
    }
  }

  const collectionIds = await collectionsByProduct(input.organizationId, sold)

  // The offer's price spread across the lines in proportion to what each is
  // worth, so a product-scoped code sees the discounted basket. Integer
  // division loses at most a unit per line, which cannot inflate the discount.
  const weights = sold.map((line) => line.unitPriceCents * line.quantity)
  const goodsPerLine =
    soldRegular > 0 && soldGoods !== soldRegular
      ? allocate(soldGoods, weights)
      : weights

  const pricingLines: PricingLine[] = sold.map((line, index) => ({
    id: line.key,
    variantId: line.variantId ?? '',
    productId: line.productId ?? '',
    quantity: line.quantity,
    unitPriceCents: Math.floor(
      goodsPerLine[index] / Math.max(1, line.quantity)
    ),
    isTaxable: false,
    taxCode: null,
    requiresShipping: true,
    weightGrams: 0,
    collectionIds: collectionIds.get(line.productId ?? '') ?? [],
  }))

  const evaluation = evaluateDiscount(pricingLines, discount)

  if (evaluation.rejection) {
    return {
      code: discount.code,
      discountCents: 0,
      perLine: zeros,
      note: `${discount.code} no longer applies — ${(
        discountRejectionMessage(evaluation.rejection) ?? 'it does not qualify.'
      ).replace(/^This basket/, 'the basket')}`,
    }
  }

  // Free shipping is not money off the goods. It is honoured by the caller
  // waiving delivery, not by discounting the basket.
  if (discount.type === 'FREE_SHIPPING') {
    return {
      code: discount.code,
      discountCents: 0,
      perLine: zeros,
      note: `${discount.code} is a free-delivery code — set the delivery charge to zero to honour it.`,
    }
  }

  const total = Math.min(evaluation.totalCents, soldGoods)

  return {
    code: discount.code,
    discountCents: Math.max(0, total),
    // Rescaled when the cap above bit, so the per-line figures still sum to the
    // order-level one — refunds are computed per line and must reconcile.
    perLine:
      total === evaluation.totalCents
        ? evaluation.perLine
        : allocate(total, evaluation.perLine),
    note: null,
  }
}

/**
 * Which groups each product belongs to, for a collection-scoped code.
 *
 * "Collection" is now whatever the merchant's own site files a product under —
 * its categories, its collections, whatever their platform calls them — read
 * back with the products themselves. A scoped code therefore matches against
 * their taxonomy rather than against a copy of it maintained here, which is the
 * whole reason the copy is gone.
 *
 * A catalogue that cannot be read leaves the map empty, which narrows a
 * collection-scoped code to nothing rather than widening it to everything. An
 * edit that quietly discounts the whole basket because a lookup failed is the
 * expensive direction to be wrong in.
 */
async function collectionsByProduct(
  organizationId: string,
  lines: OrderEditQuoteLine[]
): Promise<Map<string, string[]>> {
  const productIds = [
    ...new Set(lines.map((line) => line.productId).filter(Boolean)),
  ] as string[]

  const out = new Map<string, string[]>()
  if (productIds.length === 0) return out

  try {
    const products = await getProductsByIds(organizationId, productIds)
    for (const [id, product] of products) out.set(id, product.groupIds)
  } catch (error) {
    if (!isCatalogError(error)) throw error
  }

  return out
}
