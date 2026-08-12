import 'server-only'
import {
  getPublicOffers,
  getPublicPromotions,
  getPublicShipping,
} from './offerService'
import type { PublicOffer } from '@/lib/offers/types'

/**
 * The page's offers, delivery rates and promotions as Liquid drops.
 *
 * This is what lets a bundle card *be* the bundle rather than a picture of one.
 * Before offers existed, a merchant typed "৳1800" into a bundle section's
 * settings and the order form sold a single variant at whatever it cost — two
 * numbers with nothing keeping them equal. Now every section reads the same
 * `offers` array the order form does, so the price on the card is the price
 * charged, by construction.
 *
 * Snake_case throughout, because that is what Liquid authors expect and these
 * names appear in templates merchants write by hand. Money stays in minor units
 * so the `money` filter can format it for the store's currency, exactly like
 * `product.price`.
 */

export interface OfferItemDrop {
  title: string
  image: string | null
  quantity: number
  price: number
}

export interface OfferDrop {
  key: string
  kind: string
  label: string
  description: string | null
  badge: string | null
  image: string | null
  is_default: boolean

  /** What the page leads with for this offer, in minor units. */
  price: number
  compare_at_price: number
  savings: number
  /** Whole percent saved, for "৪০% ছাড়" style badges. 0 when nothing is saved. */
  savings_percent: number

  min_quantity: number
  max_quantity: number

  items: OfferItemDrop[]
  tiers: { quantity: number; price: number }[]

  /** The anchor a "buy this" button should point at. */
  url: string
}

export interface OfferScope {
  offers: OfferDrop[]
  /** The preselected offer, so a single-offer page can just use `offer`. */
  offer: OfferDrop | null
  shipping: {
    ask_zone: boolean
    rates: { id: string; label: string; price: number }[]
  }
  promotions: {
    free_shipping: {
      enabled: boolean
      min_subtotal: number
      min_quantity: number
    }
    rules: {
      basis: string
      threshold: number
      threshold_quantity: number
      reward: string
      value: number
      value_percent: number
      max_discount: number
      label: string | null
    }[]
  }
}

export const EMPTY_OFFER_SCOPE: OfferScope = {
  offers: [],
  offer: null,
  shipping: { ask_zone: false, rates: [] },
  promotions: {
    free_shipping: { enabled: false, min_subtotal: 0, min_quantity: 0 },
    rules: [],
  },
}

function toOfferDrop(offer: PublicOffer): OfferDrop {
  const savings = Math.max(0, offer.compareAtCents - offer.headlinePriceCents)
  const savingsPercent =
    offer.compareAtCents > 0
      ? Math.round((savings / offer.compareAtCents) * 100)
      : 0

  const lines = offer.kind === 'FIXED' ? offer.items : offer.pool

  return {
    key: offer.key,
    kind: offer.kind.toLowerCase(),
    label: offer.label,
    description: offer.description,
    badge: offer.badge,
    image: offer.imageUrl,
    is_default: offer.isDefault,
    price: offer.headlinePriceCents,
    compare_at_price: offer.compareAtCents,
    savings,
    savings_percent: savingsPercent,
    min_quantity: offer.minQuantity,
    max_quantity: offer.maxQuantity,
    items: lines.map((line) => ({
      title: line.title,
      image: line.imageUrl,
      quantity: line.quantity,
      price:
        line.variants.find((variant) => variant.id === line.pinnedVariantId)
          ?.priceCents ??
        line.variants.find((variant) => variant.available)?.priceCents ??
        line.variants[0]?.priceCents ??
        0,
    })),
    tiers: offer.tiers.map((tier) => ({
      quantity: tier.quantity,
      price: tier.priceCents,
    })),
    // Every offer button goes to the one order form on the page. Selecting the
    // right offer there is the form's job, driven by this key.
    url: `#order`,
  }
}

export async function buildOfferScope(
  pageId: string,
  organizationId: string
): Promise<OfferScope> {
  const [offers, shipping, promotions] = await Promise.all([
    getPublicOffers(pageId),
    getPublicShipping(pageId, organizationId),
    getPublicPromotions(pageId),
  ])

  const drops = offers.map(toOfferDrop)

  return {
    offers: drops,
    offer: drops.find((drop) => drop.is_default) ?? drops[0] ?? null,
    shipping: {
      ask_zone: shipping.askZone,
      rates: shipping.rates.map((rate) => ({
        id: rate.id,
        label: rate.label,
        price: rate.priceCents,
      })),
    },
    promotions: {
      free_shipping: {
        enabled: promotions.freeShipping.enabled,
        min_subtotal: promotions.freeShipping.minSubtotalCents,
        min_quantity: promotions.freeShipping.minQuantity,
      },
      rules: promotions.discountRules.map((rule) => ({
        basis: rule.basis.toLowerCase(),
        threshold: rule.thresholdCents,
        threshold_quantity: rule.thresholdQuantity,
        reward: rule.reward.toLowerCase(),
        value: rule.valueCents,
        value_percent: rule.valueBps / 100,
        max_discount: rule.maxDiscountCents,
        label: rule.label,
      })),
    },
  }
}
