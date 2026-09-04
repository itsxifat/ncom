import 'server-only'
import { prisma } from '@/server/db/client'
import {
  getProductsByIds,
  isCatalogError,
  isSellable,
  type RemoteProduct,
  type RemoteVariant,
} from '@/server/catalog'
import {
  applyOfferPricing,
  headlinePrice,
  quoteOffer,
} from '@/lib/offers/pricing'
import type {
  OfferLine,
  OfferSelectionItem,
  OfferVariantChoice,
  PublicDiscountRule,
  PublicOffer,
  PublicPromotions,
  PublicShipping,
  ShippingChoice,
} from '@/lib/offers/types'

/**
 * Reads a landing page's offers, delivery rules and promotions, and prices a
 * buyer's selection against them.
 *
 * The split of responsibility here matters. `lib/offers/pricing` knows the
 * arithmetic and runs anywhere; this module knows where the *goods* are — which
 * products still exist, which variants are in stock, what they cost right now —
 * and is the only thing allowed to answer "what do we charge". A price that
 * reaches the order route without passing through `priceOfferSubmission` has
 * not been checked against anything.
 *
 * An offer stores the merchant's own product and variant ids and nothing else
 * about the goods: no title, no price, no photograph. All of that is read from
 * their website while the page renders. So a merchant who raises a price at
 * 3pm has raised it on every landing page by 3pm, and one who deletes a product
 * has taken it off sale rather than leaving a bundle quoting a price nobody
 * honours — which is precisely what a copied catalogue could not promise.
 *
 * Everything is read-only apart from the pricing result. Nothing here creates
 * an order; see offerOrderService for that.
 */

/**
 * How many products a page's offers may reference in total.
 *
 * A landing page sells one thing or a small set. A merchant who has attached
 * hundreds of products to one page's offers has built a catalogue page by
 * accident, and loading it into every render of the form would cost more than
 * it could ever earn.
 */
const OFFER_PRODUCT_LIMIT = 200

const offerInclude = {
  items: { orderBy: { position: 'asc' } },
  tiers: { orderBy: { quantity: 'asc' } },
  variantRules: true,
  image: { select: { url: true } },
} as const

type OfferRow = Awaited<
  ReturnType<typeof prisma.offer.findMany<{ include: typeof offerInclude }>>
>[number]

/**
 * The goods behind a set of offers, read from the merchant's website.
 *
 * One call for every product on the page, whatever the offers are: a lander
 * with six bundles over the same four products is four ids and one request.
 */
type Catalogue = Map<string, RemoteProduct>

async function loadCatalogue(
  organizationId: string,
  rows: OfferRow[]
): Promise<Catalogue> {
  const ids = [
    ...new Set(rows.flatMap((row) => row.items.map((item) => item.productId))),
  ]
  return getProductsByIds(organizationId, ids)
}

/** The per-size rules of one offer, by variant. */
type VariantRules = Map<string, OfferRow['variantRules'][number]>

function toVariantChoice(
  variant: RemoteVariant,
  rules: VariantRules
): OfferVariantChoice {
  const rule = rules.get(variant.id)

  return {
    id: variant.id,
    title: variant.title,
    priceCents: variant.priceCents,
    // The merchant's own stock figure, as of this request. An untracked variant
    // never runs out and a back-order policy sells past zero — the same rule
    // the order route applies, because a page that offers what checkout refuses
    // is worse than one that shows nothing.
    available: isSellable({
      available: variant.available,
      policy: variant.policy,
    }),
    // Only a rule that actually names a mode overrides anything. A row that
    // exists purely to exclude a size carries no pricing, and treating its
    // zeroed columns as "0% off" would quietly cancel the offer on that size
    // instead of removing it.
    pricing: rule?.pricingMode
      ? {
          mode: rule.pricingMode,
          priceCents: rule.priceCents,
          discountBps: rule.discountBps,
        }
      : null,
  }
}

/**
 * One offer line as the page should see it, or why it cannot be shown at all.
 *
 * Being out of stock is *not* a reason to refuse. A sold-out product stays on
 * the card with its options marked, because a bundle that vanishes the moment
 * one size runs out takes the whole campaign down with it — the merchant's ad
 * still points at the page, and the buyer arrives to find nothing for sale and
 * no explanation. `soldOut` says the line has nothing sellable left so callers
 * can label it; every option carries its own `available` flag either way, the
 * order form disables them, and `priceOfferSubmission` still refuses to sell
 * one. Showing an empty shelf is a merchandising decision; selling from it is
 * not, and that boundary has not moved.
 *
 * A draft product is still refused: publication status is the merchant saying
 * this is not ready to be seen, which is a different statement from "we ran
 * out". So is a line whose every size the merchant excluded by hand.
 *
 * The reason travels with the refusal rather than being re-derived by whoever
 * wants to explain it. A merchant whose bundle never appears on their page is
 * owed a sentence saying which product is at fault, and a second implementation
 * of these rules written to produce that sentence would drift from this one —
 * at which point the admin confidently explains something the storefront is not
 * actually doing.
 *
 * `status` is the only publication gate. There is deliberately no check on
 * `publishedAt` here: nothing in the product editor ever sets that column, so
 * requiring it hid every offer on the platform behind a field no merchant
 * could fill in.
 */
type LineResult =
  | { ok: true; line: OfferLine; soldOut: boolean }
  | { ok: false; reason: string }

function toOfferLine(
  item: OfferRow['items'][number],
  rules: VariantRules,
  catalogue: Catalogue
): LineResult {
  const product = catalogue.get(item.productId)

  // The merchant's website no longer returns this product: deleted, renamed to
  // a new id, or filtered out of their connector's own query. Named by id
  // because there is nothing else left to name it by — the offer never stored
  // a title, and inventing one from a stale copy is how an admin ends up
  // debugging a product that has not existed for a week.
  if (!product) {
    return {
      ok: false,
      reason: `product ${item.productId} is not in the connected catalogue`,
    }
  }

  if (product.status !== 'ACTIVE') {
    return {
      ok: false,
      reason: `"${product.title}" is not an active product`,
    }
  }

  const pinned = item.variantId
    ? product.variants.find((variant) => variant.id === item.variantId)
    : undefined

  // A pinned variant that no longer exists is treated as "no pin" rather than
  // as a broken line: the merchant's intent was to sell this product, and the
  // buyer can still choose.
  let candidates = pinned ? [pinned] : product.variants

  // The line's own shortlist of sizes, when the merchant narrowed it. A
  // shortlist that matches nothing any more — every named size deleted — is
  // treated as no shortlist, because dropping the product entirely is a worse
  // answer to a stale id than selling it in the sizes that still exist.
  if (!pinned && item.variantIds.length > 0) {
    const allowed = new Set(item.variantIds)
    const narrowed = candidates.filter((variant) => allowed.has(variant.id))
    if (narrowed.length > 0) candidates = narrowed
  }

  // Sizes the merchant carved out of this offer are gone, not shown at a price
  // the offer does not honour.
  candidates = candidates.filter((variant) => !rules.get(variant.id)?.excluded)

  const choices = candidates.map((variant) => toVariantChoice(variant, rules))
  if (choices.length === 0) {
    return {
      ok: false,
      reason: `every option of "${product.title}" is excluded from this offer`,
    }
  }
  return {
    ok: true,
    soldOut: !choices.some((choice) => choice.available),
    line: {
      productId: product.id,
      title: product.title,
      imageUrl: product.images[0]?.url ?? null,
      quantity: Math.max(1, item.quantity),
      pinnedVariantId: pinned?.id ?? null,
      variants: choices,
    },
  }
}

/**
 * One offer as a page should see it, or why the page will not show it.
 *
 * The `ok: false` branch is what the Offers screen reads to warn a merchant
 * that a bundle they can see in their own admin is invisible to buyers. That
 * situation is not an error anywhere — the row saved, it is switched on, its
 * dates are fine — so nothing else in the system has any reason to mention it.
 *
 * `soldOut` names the products in a shown offer that have nothing left, which
 * is the merchant's cue to restock rather than to go looking for a bug.
 */
type OfferResult =
  | { ok: true; offer: PublicOffer; soldOut: string[] }
  | { ok: false; reason: string }

function resolveOffer(row: OfferRow, catalogue: Catalogue): OfferResult {
  const rules: VariantRules = new Map(
    row.variantRules.map((rule) => [rule.variantId, rule])
  )

  const results = row.items.map((item) => toOfferLine(item, rules, catalogue))
  const kept = results.filter(
    (result): result is { ok: true; line: OfferLine; soldOut: boolean } =>
      result.ok
  )
  const lines = kept.map((result) => result.line)
  const soldOut = kept
    .filter((result) => result.soldOut)
    .map((result) => result.line.title)

  const isPool = row.kind === 'COLLECTION' || row.kind === 'ALACARTE'

  // A FIXED offer is an exact set: if a part of it may not be *shown* — a draft
  // product, a line the merchant excluded entirely — the offer as advertised
  // does not exist. Running out of stock is not that; a sold-out line stays,
  // marked, and the card goes up with it.
  if (!isPool && lines.length !== row.items.length) {
    const blocked = results.find((result) => !result.ok)
    return {
      ok: false,
      reason:
        blocked?.ok === false ? blocked.reason : 'a product cannot be sold',
    }
  }
  if (lines.length === 0) {
    const blocked = results.find((result) => !result.ok)
    return {
      ok: false,
      reason:
        blocked?.ok === false ? blocked.reason : 'it has no products in it',
    }
  }

  const tiers = row.tiers.map((tier) => ({
    quantity: tier.quantity,
    reward: tier.reward,
    priceCents: tier.priceCents,
    discountBps: tier.discountBps,
  }))
  if (row.kind === 'COLLECTION' && tiers.length === 0) {
    return { ok: false, reason: 'its price ladder has no quantities on it' }
  }

  const offer: PublicOffer = {
    key: row.key,
    kind: row.kind,
    label: row.label,
    description: row.description,
    badge: row.badge,
    imageUrl: row.image?.url ?? lines[0]?.imageUrl ?? null,
    isDefault: row.isDefault,
    items: isPool ? [] : lines,
    pool: isPool ? lines : [],
    tiers,
    tierMode: row.tierMode,
    gift: findGift(row, catalogue),
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    pricing: {
      mode: row.pricingMode,
      priceCents: row.priceCents,
      discountBps: row.discountBps,
    },
    compareAtCents: row.compareAtCents,
    headlinePriceCents: 0,
  }

  offer.headlinePriceCents = headlinePrice(offer)

  // An unset compare-at falls back to what the goods actually list for, which
  // is the only strike-through price that is true.
  if (offer.compareAtCents <= 0) {
    offer.compareAtCents = regularTotalOf(offer)
  }

  return { ok: true, offer, soldOut }
}

/**
 * The gift, found among the offer's own products.
 *
 * The merchant picks a gift from the products already in the offer — the form
 * says so and offers nothing else — so it resolves out of the catalogue that
 * was loaded for the lines, with no extra call and no separate product id to
 * store. A gift whose variant has since been deleted simply is not one: the
 * bundle still sells, without it, which is what offerOrderService already does
 * when a gift runs out mid-checkout.
 */
function findGift(row: OfferRow, catalogue: Catalogue): PublicOffer['gift'] {
  if (!row.giftVariantId) return null

  for (const item of row.items) {
    const product = catalogue.get(item.productId)
    const variant = product?.variants.find(
      (candidate) => candidate.id === row.giftVariantId
    )
    if (!product || !variant) continue

    return {
      variantId: variant.id,
      productId: product.id,
      title: product.title,
      variantTitle: variant.title,
      imageUrl: variant.imageUrl ?? product.images[0]?.url ?? null,
      quantity: Math.max(1, row.giftQuantity),
      priceCents: variant.priceCents,
    }
  }

  return null
}

/** What an offer's goods list for at their own prices, before any discount. */
function regularTotalOf(offer: PublicOffer): number {
  if (offer.kind !== 'FIXED') return 0
  return offer.items.reduce((total, line) => {
    const preferred =
      line.variants.find((variant) => variant.id === line.pinnedVariantId) ??
      line.variants.find((variant) => variant.available) ??
      line.variants[0]
    return total + (preferred?.priceCents ?? 0) * Math.max(1, line.quantity)
  }, 0)
}

/**
 * Every sellable offer on a page, in the merchant's order.
 *
 * Three scopes are unioned here: the page's own offers, the ones its store runs
 * everywhere, and the ones the workspace runs across every store. A merchant
 * who typed "any 3 shirts for 1500" once at the workspace level gets it on
 * every campaign page without copying it, and a page that needs its own
 * headline bundle still adds one — page offers sort first, because a page-level
 * offer is the more specific statement and belongs at the top of the card list.
 *
 * Offers that cannot currently be sold are dropped rather than rendered as
 * disabled: a landing page's job is to make one choice obvious, and a greyed
 * out "sold out" bundle sitting next to it only creates doubt.
 */
export async function getPublicOffers(pageId: string): Promise<PublicOffer[]> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { storeId: true, store: { select: { organizationId: true } } },
  })
  if (!page) return []

  const now = new Date()

  const rows = await prisma.offer.findMany({
    where: {
      isActive: true,
      // A campaign that has not opened yet, or has closed, is not on sale. Both
      // bounds are optional and an unset one means "no limit in that
      // direction", which is what an always-on offer is.
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
      OR: [
        { scope: 'PAGE', pageId },
        { scope: 'STORE', storeId: page.storeId },
        { scope: 'ORGANIZATION', organizationId: page.store.organizationId },
      ],
    },
    orderBy: [{ scope: 'asc' }, { position: 'asc' }],
    take: OFFER_PRODUCT_LIMIT,
    include: offerInclude,
  })

  const catalogue = await loadCatalogue(page.store.organizationId, rows)

  const offers = rows
    .map((row) => resolveOffer(row, catalogue))
    .filter(
      (result): result is { ok: true; offer: PublicOffer; soldOut: string[] } =>
        result.ok
    )
    .map((result) => result.offer)

  // Exactly one default, so the form always has something selected and the
  // buyer never has to make a choice before they can start typing.
  const firstDefault = offers.find((offer) => offer.isDefault) ?? offers[0]
  return offers.map((offer) => ({
    ...offer,
    isDefault: offer === firstDefault,
  }))
}

/**
 * What a page would actually do with each of these offers.
 *
 * For the Offers screen, and answered by the storefront's own resolver so the
 * list cannot claim an offer is fine while pages quietly drop it.
 *
 * Two different things, which the admin must not conflate. `hidden` means the
 * page renders nothing at all — the worst state this model has, because the row
 * saved, it reads as Live, and the merchant's only clue is a page that looks
 * empty. `soldOut` means the offer *is* on the page with some of its goods
 * marked unavailable, which needs restocking rather than debugging.
 *
 * Deliberately says nothing about `isActive` or the schedule — the list already
 * badges those, and repeating them here would put two authorities on screen for
 * the same fact.
 */
export interface OfferHealth {
  /** Why the page shows nothing, or null when it shows the offer. */
  hidden: string | null
  /** Products on a shown offer whose every option is out of stock. */
  soldOut: string[]
}

export async function checkOfferHealth(
  offerIds: string[]
): Promise<Map<string, OfferHealth>> {
  const health = new Map<string, OfferHealth>()
  if (offerIds.length === 0) return health

  const rows = await prisma.offer.findMany({
    where: { id: { in: offerIds } },
    include: offerInclude,
  })
  if (rows.length === 0) return health

  // Every offer in one screen belongs to one workspace, so one catalogue read
  // answers for all of them.
  let catalogue: Catalogue
  try {
    catalogue = await loadCatalogue(rows[0].organizationId, rows)
  } catch (error) {
    // The merchant's site is down or misconfigured. Every offer on the screen
    // is hidden from buyers right now and saying so once, accurately, beats
    // thirty rows each guessing at a different reason.
    const reason = isCatalogError(error)
      ? `the connected website could not be read (${error.merchantMessage})`
      : 'the connected website could not be read'
    for (const row of rows) {
      health.set(row.id, { hidden: reason, soldOut: [] })
    }
    return health
  }

  for (const row of rows) {
    const result = resolveOffer(row, catalogue)
    if (!result.ok) {
      health.set(row.id, { hidden: result.reason, soldOut: [] })
    } else if (result.soldOut.length > 0) {
      health.set(row.id, { hidden: null, soldOut: result.soldOut })
    }
  }

  return health
}

const DEFAULT_SHIPPING: PublicShipping = { askZone: false, rates: [] }

const EMPTY_PROMOTIONS: PublicPromotions = {
  freeShipping: { enabled: false, minSubtotalCents: 0, minQuantity: 0 },
  discountRules: [],
}

/**
 * The delivery rules for a page.
 *
 * A page without its own checkout row inherits the organisation's shipping
 * zones, which is the sane default: a merchant who has not thought about
 * delivery on this page still gets whatever they configured for the business.
 */
export async function getPublicShipping(
  pageId: string,
  organizationId: string
): Promise<PublicShipping> {
  const checkout = await prisma.pageCheckout.findUnique({
    where: { pageId },
    include: { rates: { orderBy: { position: 'asc' } } },
  })

  if (!checkout || checkout.shippingMode === 'INHERIT') {
    return inheritedShipping(organizationId)
  }

  if (checkout.shippingMode === 'FREE') {
    return {
      askZone: false,
      rates: [{ id: 'free', label: 'Free delivery', priceCents: 0 }],
    }
  }

  if (checkout.shippingMode === 'FLAT') {
    return {
      askZone: false,
      rates: [
        {
          id: 'flat',
          label: 'Delivery',
          priceCents: Math.max(0, checkout.flatRateCents),
        },
      ],
    }
  }

  const rates: ShippingChoice[] = checkout.rates.map((rate) => ({
    id: rate.id,
    label: rate.label,
    priceCents: Math.max(0, rate.priceCents),
  }))

  if (rates.length === 0) return inheritedShipping(organizationId)

  // askZone off means one price for everyone; the first rate is what they pay,
  // and offering a picker with a single option is just noise.
  return { askZone: checkout.askZone && rates.length > 1, rates }
}

async function inheritedShipping(
  organizationId: string
): Promise<PublicShipping> {
  const zones = await prisma.shippingZone.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    include: { rates: { orderBy: { priceCents: 'asc' }, take: 1 } },
  })

  const rates: ShippingChoice[] = zones
    .filter((zone) => zone.rates.length > 0)
    .map((zone) => ({
      id: zone.rates[0].id,
      label: zone.name,
      priceCents: zone.rates[0].priceCents,
    }))

  if (rates.length === 0) return DEFAULT_SHIPPING
  return { askZone: rates.length > 1, rates }
}

export async function getPublicPromotions(
  pageId: string
): Promise<PublicPromotions> {
  const checkout = await prisma.pageCheckout.findUnique({
    where: { pageId },
    include: { discountRules: { orderBy: { position: 'asc' } } },
  })
  if (!checkout) return EMPTY_PROMOTIONS

  const discountRules: PublicDiscountRule[] = checkout.discountRules.map(
    (rule) => ({
      basis: rule.basis,
      thresholdCents: rule.thresholdCents,
      thresholdQuantity: rule.thresholdQuantity,
      reward: rule.reward,
      valueCents: rule.valueCents,
      valueBps: rule.valueBps,
      maxDiscountCents: rule.maxDiscountCents,
      label: rule.label,
    })
  )

  return {
    freeShipping: {
      enabled: checkout.freeShippingEnabled,
      minSubtotalCents: checkout.freeShippingMinSubtotalCents,
      minQuantity: checkout.freeShippingMinQuantity,
    },
    discountRules,
  }
}

export interface StorefrontCommerceContext {
  pageId: string
  storeId: string
  currencyCode: string
  offers: PublicOffer[]
  shipping: PublicShipping
  promotions: PublicPromotions
  /**
   * The merchant's website did not answer, so there is nothing to sell on this
   * render — as distinct from a page whose merchant has not built an offer yet.
   *
   * Two different sentences for the shopper and two different actions for the
   * merchant, which is why the page is told which one happened rather than
   * being handed an empty list and left to guess.
   */
  catalogUnavailable: boolean
}

/**
 * Everything a page's sections need to quote a price, in one read.
 *
 * Called once per render and handed to every section, so the order form, the
 * bundle cards and the sticky bar cannot disagree about what a bundle costs —
 * they are all reading the same array. Resolving this per section instead would
 * be three queries and three chances to drift.
 */
export async function getStorefrontCommerce(
  pageId: string,
  storeId: string,
  organizationId: string
): Promise<StorefrontCommerceContext> {
  const [settings, offers, shipping, promotions] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true },
    }),
    // The only read here that leaves the building. A landing page is more than
    // its order form — the copy, the photos, the testimonials are all NCOM's
    // own — so a merchant's website having a bad minute must cost them the
    // bundle cards, not the whole page.
    getPublicOffers(pageId).catch((error: unknown) => {
      console.error('[storefront] catalogue unavailable', pageId, error)
      return null
    }),
    getPublicShipping(pageId, organizationId),
    getPublicPromotions(pageId),
  ])

  return {
    pageId,
    storeId,
    currencyCode: settings?.currencyCode ?? 'BDT',
    offers: offers ?? [],
    shipping,
    promotions,
    catalogUnavailable: offers === null,
  }
}

export interface PricedSubmission {
  offer: PublicOffer
  /** The lines to actually put in the cart, at their real variant prices. */
  selections: OfferSelectionItem[]
  regularCents: number
  goodsCents: number
  savingCents: number
  quantity: number
  /** What the offer throws in free, if anything, and how many. */
  gift: PublicOffer['gift']
}

/**
 * Prices what a buyer submitted, from the database.
 *
 * This is the trust boundary. The submission chooses *which* offer and *which*
 * variants; every number comes from here. In particular it re-reads variant
 * prices rather than believing the ones the page was rendered with, because a
 * form can sit open in a tab for an hour and a price can change in that time —
 * and because a scraped form can be re-posted with anything at all.
 *
 * Throws with a buyer-readable message; the order route passes those through.
 */
export async function priceOfferSubmission(
  pageId: string,
  offerKey: string,
  selections: OfferSelectionItem[]
): Promise<PricedSubmission> {
  const offers = await getPublicOffers(pageId)
  const offer = offers.find((candidate) => candidate.key === offerKey)
  if (!offer) throw new Error('That offer is no longer available.')

  // The buyer may only order what this offer contains. Without this check a
  // form could name any variant in the organisation's catalogue and buy it at
  // the bundle's price.
  const allowed = new Map<string, OfferVariantChoice>()
  for (const line of offer.kind === 'FIXED' ? offer.items : offer.pool) {
    for (const variant of line.variants) allowed.set(variant.id, variant)
  }

  const merged = new Map<string, OfferSelectionItem>()
  for (const selection of selections) {
    const variant = allowed.get(selection.variantId)
    if (!variant)
      throw new Error("One of the chosen items isn't part of this offer.")
    if (!variant.available)
      throw new Error('One of the chosen items is out of stock.')

    // Fold duplicate picks so stock is checked against the true total rather
    // than line by line.
    const existing = merged.get(selection.variantId)
    merged.set(selection.variantId, {
      productId: selection.productId,
      variantId: selection.variantId,
      quantity: (existing?.quantity ?? 0) + Math.max(1, selection.quantity),
    })
  }

  const resolved = [...merged.values()]
  const quote = quoteOffer(
    offer,
    resolved,
    (variantId) => allowed.get(variantId) ?? null
  )

  if (quote.error) throw new Error(quote.error)

  return {
    offer,
    selections: resolved,
    regularCents: quote.regularCents,
    goodsCents: quote.goodsCents,
    savingCents: quote.savingCents,
    quantity: quote.quantity,
    gift: offer.gift,
  }
}

/** Re-exported so callers need only this module for the common path. */
export { applyOfferPricing }
