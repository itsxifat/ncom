import 'server-only'
import { prisma } from '@/server/db/client'
import { addToCart } from './cartService'
import {
  placeOrder,
  type CampaignContext,
  type PlaceOrderResult,
} from './checkoutService'
import {
  getPublicPromotions,
  getPublicShipping,
  priceOfferSubmission,
} from './offerService'
import { applyPromotions } from '@/lib/offers/promotions'
import { formatMoney } from '@/lib/money'
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
 * It is what keeps a landing-page sale identical to every other sale: stock is
 * decremented atomically inside the checkout transaction, conversion is
 * idempotent via `Cart.completedAt` so a double-tapped button makes one order,
 * and the merchant sees the same record with the same fields as any other.
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
      quantity: selection.quantity,
    })
  }

  // The saving the buyer was promised, in two parts: what the offer takes off
  // the regular prices, and what a page promotion takes off the offer.
  const campaign: CampaignContext = {
    pageId: page.id,
    offerKey: priced.offer.key,
    offerLabel: priced.offer.label,
    offerPriceCents: priced.goodsCents,
    offerRegularCents: priced.regularCents,
    shippingCents: promo.shippingCents,
    shippingTitle: promo.freeShipping
      ? 'Free delivery'
      : (chosenRate?.label ?? null),
    discountCents: priced.savingCents + promo.discountCents,
    discountLabel: promo.label || null,
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
