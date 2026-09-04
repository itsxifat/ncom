import 'server-only'
import { prisma } from '@/server/db/client'
import { addToCart } from './cartService'
import { getProductsByIds, isCatalogError } from '@/server/catalog'
import {
  placeOrder,
  type CampaignContext,
  type PlaceOrderResult,
} from './checkoutService'
import {
  getPublicPromotions,
  getPublicShipping,
  priceOfferSubmission,
  type PricedSubmission,
} from './offerService'
import { loadDiscount } from './pricingService'
import { allocate } from '@/lib/money'
import { applyPromotions } from '@/lib/offers/promotions'
import { evaluateDiscount } from '@/lib/pricing'
import { formatMoney } from '@/lib/money'
import type { PricingLine } from '@/lib/pricing'
import type { OfferOrderInput } from '@/lib/validation/offerOrder'

/**
 * Places an order from a landing page's offer form.
 *
 * This is the whole point of the builder: a page that takes money. The buyer
 * never sees a cart or a checkout — they pick a bundle, type their name, phone
 * and address, and tap once — so this assembles the cart that flow never shows
 * and hands it to the ordinary checkout.
 *
 * Going through a real cart rather than writing an Order directly is deliberate.
 * It is what keeps a landing-page sale identical to every other sale: the goods
 * are re-read from the merchant's website and their stock asked for in the same
 * way, conversion is idempotent via `Cart.completedAt` so a double-tapped
 * button makes one order, and the merchant sees the same record with the same
 * fields as any other.
 *
 * The order of operations matters for money:
 *
 *   1. price the offer from the database (offerService — the authority);
 *   2. resolve the delivery charge from the *page's* rules, not the posted one;
 *   3. apply page promotions to the offer's goods total;
 *   4. build a cart at honest per-variant prices;
 *   5. hand the campaign's numbers to placeOrder, which records the saving as a
 *      discount rather than writing down the line prices.
 *
 * Nothing the browser sent about price survives any of those steps.
 */

export interface OfferOrderResult extends PlaceOrderResult {
  offerLabel: string
  quantity: number
}

export async function placeOfferOrder(
  organizationId: string,
  storeId: string,
  input: OfferOrderInput
): Promise<OfferOrderResult> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencyCode: true },
  })
  if (!settings) throw new Error('This store is not set up to take orders yet')

  // The page must belong to the store the request came from. Without this a
  // scraped form could name another tenant's page and sell their offers.
  const page = await prisma.page.findFirst({
    where: { id: input.pageId, storeId },
    select: { id: true, status: true },
  })
  if (!page) throw new Error('This form belongs to a different page')
  if (page.status !== 'PUBLISHED') {
    throw new Error('This page is not accepting orders yet')
  }

  const priced = await priceOfferSubmission(
    page.id,
    input.offerKey,
    input.selections
  )

  // Delivery comes from the page's own rules. The posted id only *selects*
  // among them — an id that is not on this page falls back to the first rate
  // rather than being honoured, so a tampered request cannot invent free
  // delivery.
  const shipping = await getPublicShipping(page.id, organizationId)
  const chosenRate =
    shipping.rates.find((rate) => rate.id === input.shippingRateId) ??
    shipping.rates[0] ??
    null

  const promotions = await getPublicPromotions(page.id)
  const promo = applyPromotions({
    goodsCents: priced.goodsCents,
    quantity: priced.quantity,
    shippingCents: chosenRate?.priceCents ?? 0,
    promotions,
    formatMoney: (cents) => formatMoney(cents, settings.currencyCode),
  })

  // A code the buyer typed, judged against the basket the server just priced.
  // Landing pages used to ignore workspace discounts entirely — a customer
  // handed a code by the merchant's own ad could type it into the form and be
  // charged full price, with nothing on screen saying why.
  const coupon = await resolveCoupon(
    organizationId,
    storeId,
    input.discountCode ?? null,
    priced
  )

  const cart = await prisma.cart.create({
    data: {
      organizationId,
      // Attribution: the catalogue is shared, so an order is only traceable to
      // the page that produced it if the cart records where it started.
      storeId,
      currencyCode: settings.currencyCode,
      email: input.email ?? null,
      phone: input.phone,
      note: input.note ?? null,
      shippingAddress: {
        firstName: input.name,
        address1: input.address,
        city: input.city,
        countryCode: input.countryCode,
        phone: input.phone,
      },
    },
    select: { id: true, token: true },
  })

  // Through addToCart rather than a nested create: that is where the
  // purchasable check lives (tracked stock, back-order policy), and a landing
  // page must not be able to sell what a cart page would refuse.
  for (const selection of priced.selections) {
    await addToCart(organizationId, cart.token, {
      variantId: selection.variantId,
      // Carried through so every later read of this line — pricing, the cart
      // page, checkout — resolves it with one products call rather than
      // depending on the connector's optional /variants endpoint.
      productId: selection.productId,
      quantity: selection.quantity,
    })
  }

  // The gift goes in the cart so the picker packs it and the stock moves for
  // it. It is paid for by the campaign discount below, not by the customer.
  //
  // A gift that cannot be added — it sold out while the form was open — is
  // skipped rather than failing the order. The buyer came for the bundle, and
  // refusing their money over the free tote is the worse outcome; the merchant
  // sees the order without it and can decide what to do.
  let giftCents = 0
  if (priced.gift) {
    try {
      await addToCart(organizationId, cart.token, {
        variantId: priced.gift.variantId,
        productId: priced.gift.productId,
        quantity: priced.gift.quantity,
      })
      giftCents = priced.gift.priceCents * priced.gift.quantity
    } catch {
      giftCents = 0
    }
  }

  // The saving the buyer was promised, in two parts: what the offer takes off
  // the regular prices, and what a page promotion takes off the offer.
  const campaign: CampaignContext = {
    pageId: page.id,
    offerKey: priced.offer.key,
    offerLabel: priced.offer.label,
    offerPriceCents: priced.goodsCents,
    offerRegularCents: priced.regularCents,
    shippingCents: coupon.freeShipping ? 0 : promo.shippingCents,
    shippingTitle:
      promo.freeShipping || coupon.freeShipping
        ? 'Free delivery'
        : (chosenRate?.label ?? null),
    // Four things can take money off, and they are summed rather than ranked:
    // the offer's own saving, the page's spend-and-save ladder, the gift, and
    // the typed code. The first three are the merchant's own arithmetic on
    // their own page; refusing to stack a code on top of them would mean the
    // code silently does nothing on exactly the pages it was printed for.
    discountCents:
      priced.savingCents +
      promo.discountCents +
      giftCents +
      coupon.discountCents,
    discountLabel: coupon.label || promo.label || null,
    discountCode: coupon.code,
    couponDiscountCents: coupon.discountCents,
    giftVariants:
      giftCents > 0 && priced.gift
        ? new Map([[priced.gift.variantId, priced.gift.quantity]])
        : undefined,
  }

  const result = await placeOrder(
    organizationId,
    { cartToken: cart.token, paymentProvider: 'CASH_ON_DELIVERY' },
    campaign
  )

  return {
    ...result,
    offerLabel: priced.offer.label,
    quantity: priced.quantity,
  }
}

interface ResolvedCoupon {
  code: string | null
  label: string | null
  discountCents: number
  freeShipping: boolean
}

const NO_COUPON: ResolvedCoupon = {
  code: null,
  label: null,
  discountCents: 0,
  freeShipping: false,
}

/**
 * What a typed code is worth against this offer's goods.
 *
 * Judged on the *offer's* prices, not the catalogue's: the bundle has already
 * come down from 2000 to 1500, and a further 10% is 10% of what the customer is
 * being asked to pay. Discounting the list price instead would hand out more
 * than the merchant's own page advertises.
 *
 * A code that does not qualify earns nothing and stops the order for nobody.
 * The buyer has typed their address by this point, and refusing the whole sale
 * over a mistyped code is the most expensive possible way to say "that is not
 * valid".
 */
async function resolveCoupon(
  organizationId: string,
  storeId: string,
  code: string | null,
  priced: PricedSubmission
): Promise<ResolvedCoupon> {
  if (!code) return NO_COUPON

  const discount = await loadDiscount(organizationId, code, storeId)
  if (!discount) return NO_COUPON

  // Which groups each product is filed under on the merchant's own site, for a
  // collection-scoped code. Read with the products rather than from a table
  // here — see collectionsByProduct in orderEditPricing for the same reasoning.
  const productIds = [...new Set(priced.selections.map((s) => s.productId))]
  const collectionsByProduct = new Map<string, string[]>()
  try {
    const products = await getProductsByIds(organizationId, productIds)
    for (const [id, product] of products) {
      collectionsByProduct.set(id, product.groupIds)
    }
  } catch (error) {
    // A code the buyer typed is not worth failing a sale over. An unreadable
    // catalogue narrows a scoped code to nothing, which is the safe direction.
    if (!isCatalogError(error)) throw error
  }

  // Look the unit prices back up so each line is weighed by what it is
  // actually worth. The offer's own discount is then spread across those
  // weights, which is what makes a product-scoped code see the *bundle* price
  // of the shirt rather than its list price.
  const allowed = new Map<string, number>()
  for (const line of [...priced.offer.items, ...priced.offer.pool]) {
    for (const variant of line.variants) {
      allowed.set(variant.id, variant.priceCents)
    }
  }

  const weights = priced.selections.map(
    (selection) => (allowed.get(selection.variantId) ?? 0) * selection.quantity
  )
  const goodsPerLine = allocate(priced.goodsCents, weights)

  const lines: PricingLine[] = priced.selections.map((selection, index) => ({
    id: String(index),
    variantId: selection.variantId,
    productId: selection.productId,
    // The line's share of the offer price, back as a unit price. Integer
    // division loses at most a unit per line to rounding, which cannot make the
    // discount larger — the clamp below is the real guarantee.
    unitPriceCents: Math.floor(goodsPerLine[index] / selection.quantity),
    quantity: selection.quantity,
    isTaxable: false,
    taxCode: null,
    requiresShipping: true,
    weightGrams: 0,
    collectionIds: collectionsByProduct.get(selection.productId) ?? [],
  }))

  const evaluation = evaluateDiscount(lines, discount)

  return {
    code: discount.code,
    label: discount.code,
    // Never more than the goods are being sold for. A code stacked on top of a
    // deep bundle discount can otherwise reach past the whole basket, and a
    // negative order total is not a thing a courier can collect.
    discountCents: Math.max(
      0,
      Math.min(evaluation.totalCents, priced.goodsCents)
    ),
    freeShipping: !evaluation.rejection && discount.type === 'FREE_SHIPPING',
  }
}
