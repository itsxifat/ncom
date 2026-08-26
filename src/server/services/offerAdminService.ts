import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import type {
  OfferKind,
  OfferPricingMode,
  OfferScope,
  OfferTierMode,
  OfferTierReward,
  PageShippingMode,
  PromotionBasis,
  PromotionReward,
} from '@/generated/prisma/enums'

/**
 * Reading and writing offers, and a landing page's delivery rates and
 * promotions.
 *
 * An offer belongs to the workspace and is *scoped* to a page, a store, or
 * everything. That is the whole shape of this module: every mutation resolves
 * the scope to a concrete (storeId, pageId) pair, checks the caller owns both,
 * and writes one row. A merchant running six campaign pages off one catalogue
 * types "any 3 for 1500" once rather than six times, and a page that needs its
 * own headline bundle still gets one.
 *
 * Nothing here republishes a page. The public site resolves offers, delivery
 * and promotions live on every render — `getStorefrontCommerce` is called by
 * the storefront route itself, not baked into the published snapshot — so an
 * offer change is visible on the next request without a republish. Snapshotting
 * them would additionally mean that editing one workspace-wide offer had to
 * recompile every page in the workspace, which is work proportional to how
 * successful the merchant is.
 */

/**
 * Resolves an offer's scope to the rows it hangs off, and proves the caller
 * owns them.
 *
 * A PAGE offer records its store too, so "everything this shop sells" stays one
 * indexed read rather than a join through pages. A STORE offer records no page.
 * An ORGANIZATION offer records neither.
 */
async function resolveScope(
  organizationId: string,
  scope: OfferScope,
  storeId: string | null,
  pageId: string | null
): Promise<{ storeId: string | null; pageId: string | null }> {
  if (scope === 'ORGANIZATION') return { storeId: null, pageId: null }

  if (scope === 'STORE') {
    if (!storeId) throw new Error('Choose which store this offer runs on')
    const store = await prisma.store.findFirst({
      where: { id: storeId, organizationId },
      select: { id: true },
    })
    if (!store) throw new Error('Store not found')
    return { storeId: store.id, pageId: null }
  }

  if (!pageId) throw new Error('Choose which page this offer runs on')
  const page = await prisma.page.findFirst({
    where: { id: pageId, store: { organizationId } },
    select: { id: true, storeId: true },
  })
  if (!page) throw new Error('Page not found')
  return { storeId: page.storeId, pageId: page.id }
}

async function assertPageInOrg(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId, store: { organizationId } },
    select: { id: true, status: true },
  })
  if (!page) throw new Error('Page not found')
  return page
}

/**
 * One offer as the editor works with it.
 *
 * Only ids of products and variants, not the products themselves: the editor is
 * rendered with the catalogue already and resolves titles, photos and prices
 * from it. That matters because this shape is also what a save returns to the
 * browser — the panel replaces its list with the server's answer so a freshly
 * created offer knows its own id — and shipping the full product graph back on
 * every keystroke-sized edit would be paying for data already on screen.
 */
export interface OfferSummaryRow {
  id: string
  key: string
  label: string
  description: string | null
  badge: string | null
  scope: OfferScope
  storeId: string | null
  pageId: string | null
  kind: OfferKind
  pricingMode: OfferPricingMode
  priceCents: number
  discountBps: number
  compareAtCents: number
  minQuantity: number
  maxQuantity: number
  isDefault: boolean
  isActive: boolean
  position: number
  tierMode: OfferTierMode
  startsAt: Date | null
  endsAt: Date | null
  giftVariantId: string | null
  giftQuantity: number
  items: {
    productId: string
    variantId: string | null
    variantIds: string[]
    quantity: number
  }[]
  tiers: {
    quantity: number
    reward: OfferTierReward
    priceCents: number
    discountBps: number
  }[]
  variantRules: {
    variantId: string
    excluded: boolean
    pricingMode: OfferPricingMode | null
    priceCents: number
    discountBps: number
  }[]
}

const offerSelect = {
  id: true,
  key: true,
  label: true,
  description: true,
  badge: true,
  scope: true,
  storeId: true,
  pageId: true,
  kind: true,
  pricingMode: true,
  priceCents: true,
  discountBps: true,
  compareAtCents: true,
  minQuantity: true,
  maxQuantity: true,
  isDefault: true,
  isActive: true,
  position: true,
  tierMode: true,
  startsAt: true,
  endsAt: true,
  giftVariantId: true,
  giftQuantity: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      productId: true,
      variantId: true,
      variantIds: true,
      quantity: true,
    },
  },
  tiers: {
    orderBy: { quantity: 'asc' },
    select: {
      quantity: true,
      reward: true,
      priceCents: true,
      discountBps: true,
    },
  },
  variantRules: {
    select: {
      variantId: true,
      excluded: true,
      pricingMode: true,
      priceCents: true,
      discountBps: true,
    },
  },
} as const

export interface OfferFilter {
  scope?: OfferScope
  storeId?: string
  pageId?: string
}

/**
 * Every offer in the workspace, most specific scope first.
 *
 * Filtered by scope when the caller is looking at one shop or one page, and
 * unfiltered for the workspace list — which is the screen a merchant opens to
 * answer "what am I running right now", a question that has no useful answer
 * if it can only be asked one page at a time.
 */
export async function listOffers(
  organizationId: string,
  filter: OfferFilter = {}
): Promise<OfferSummaryRow[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.offer.findMany({
    where: {
      organizationId,
      scope: filter.scope,
      storeId: filter.storeId,
      pageId: filter.pageId,
    },
    orderBy: [{ scope: 'asc' }, { position: 'asc' }],
    select: offerSelect,
  })
}

/** Everything one page sells, in the order a buyer sees it. */
export async function listOffersForPage(
  organizationId: string,
  pageId: string
): Promise<OfferSummaryRow[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const page = await prisma.page.findFirst({
    where: { id: pageId, store: { organizationId } },
    select: { storeId: true },
  })
  if (!page) throw new Error('Page not found')

  return prisma.offer.findMany({
    where: {
      organizationId,
      OR: [
        { scope: 'PAGE', pageId },
        { scope: 'STORE', storeId: page.storeId },
        { scope: 'ORGANIZATION' },
      ],
    },
    orderBy: [{ scope: 'asc' }, { position: 'asc' }],
    select: offerSelect,
  })
}

export async function getOffer(
  organizationId: string,
  offerId: string
): Promise<OfferSummaryRow | null> {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.offer.findFirst({
    where: { id: offerId, organizationId },
    select: offerSelect,
  })
}

export interface OfferItemInput {
  productId: string
  variantId: string | null
  /** Which sizes this line covers. Empty means all of them. */
  variantIds?: string[]
  quantity: number
}

export interface OfferVariantRuleInput {
  variantId: string
  excluded: boolean
  pricingMode: OfferPricingMode | null
  priceCents: number
  discountBps: number
}

export interface OfferInput {
  key?: string
  label: string
  description?: string | null
  badge?: string | null
  scope: OfferScope
  storeId?: string | null
  pageId?: string | null
  kind: OfferKind
  pricingMode: OfferPricingMode
  priceCents: number
  discountBps: number
  compareAtCents: number
  minQuantity: number
  maxQuantity: number
  isDefault: boolean
  isActive: boolean
  tierMode: OfferTierMode
  startsAt?: Date | null
  endsAt?: Date | null
  giftVariantId?: string | null
  giftQuantity?: number
  items: OfferItemInput[]
  tiers: {
    quantity: number
    reward: OfferTierReward
    priceCents: number
    discountBps: number
  }[]
  variantRules?: OfferVariantRuleInput[]
}

/**
 * A URL-safe, human-readable key, unique across the workspace.
 *
 * Readable because it ends up in order records a merchant reads — "family-pack"
 * tells them what sold, a cuid does not. Uniqueness is enforced by the
 * database, so a collision is resolved by suffixing rather than by hoping.
 */
async function uniqueOfferKey(
  organizationId: string,
  label: string,
  exclude?: string
) {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'offer'

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const clash = await prisma.offer.findFirst({
      where: {
        organizationId,
        key: candidate,
        NOT: exclude ? { id: exclude } : undefined,
      },
      select: { id: true },
    })
    if (!clash) return candidate
  }
  return `${base}-${Date.now()}`
}

export async function createOffer(organizationId: string, input: OfferInput) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const placement = await resolveScope(
    organizationId,
    input.scope,
    input.storeId ?? null,
    input.pageId ?? null
  )
  await assertProductsInOrg(organizationId, input.items)
  await assertVariantsInOrg(organizationId, collectVariantIds(input))

  const position = await prisma.offer.count({
    where: { organizationId, scope: input.scope, pageId: placement.pageId },
  })
  const key = input.key ?? (await uniqueOfferKey(organizationId, input.label))

  const offer = await prisma.offer.create({
    data: {
      organizationId,
      scope: input.scope,
      storeId: placement.storeId,
      pageId: placement.pageId,
      key,
      position,
      ...scalarFields(input),
      items: { create: input.items.map(toItemCreate) },
      tiers: { create: normalizeTierInput(input.tiers) },
      variantRules: { create: normalizeRuleInput(input.variantRules) },
    },
    select: { id: true },
  })

  if (input.isDefault) await clearOtherDefaults(offer.id, placement.pageId)
  return offer
}

export async function updateOffer(
  organizationId: string,
  offerId: string,
  input: OfferInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.offer.findFirst({
    where: { id: offerId, organizationId },
    select: { id: true },
  })
  if (!existing) throw new Error('Offer not found')

  const placement = await resolveScope(
    organizationId,
    input.scope,
    input.storeId ?? null,
    input.pageId ?? null
  )
  await assertProductsInOrg(organizationId, input.items)
  await assertVariantsInOrg(organizationId, collectVariantIds(input))

  // Items, tiers and per-size rules are replaced wholesale rather than diffed.
  // They carry no identity a merchant would recognise and nothing references
  // them, so a replace is both simpler and free of the "edited a line that was
  // deleted in another tab" class of bug.
  await prisma.$transaction([
    prisma.offerItem.deleteMany({ where: { offerId } }),
    prisma.offerTier.deleteMany({ where: { offerId } }),
    prisma.offerVariantRule.deleteMany({ where: { offerId } }),
    prisma.offer.update({
      where: { id: offerId },
      data: {
        scope: input.scope,
        storeId: placement.storeId,
        pageId: placement.pageId,
        ...scalarFields(input),
        items: { create: input.items.map(toItemCreate) },
        tiers: { create: normalizeTierInput(input.tiers) },
        variantRules: { create: normalizeRuleInput(input.variantRules) },
      },
    }),
  ])

  if (input.isDefault) await clearOtherDefaults(offerId, placement.pageId)
}

export async function deleteOffer(organizationId: string, offerId: string) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await prisma.offer.deleteMany({ where: { id: offerId, organizationId } })
}

export async function setOfferActive(
  organizationId: string,
  offerId: string,
  isActive: boolean
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await prisma.offer.updateMany({
    where: { id: offerId, organizationId },
    data: { isActive },
  })
}

export async function reorderOffers(
  organizationId: string,
  orderedIds: string[]
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  await prisma.$transaction(
    orderedIds.map((id, position) =>
      prisma.offer.updateMany({
        where: { id, organizationId },
        data: { position },
      })
    )
  )
}

/**
 * The offer a page preselects. Exactly one, always.
 *
 * A form with nothing chosen asks the buyer to make a decision before they can
 * begin, which is the single most expensive moment on a landing page.
 *
 * Cleared across everything the same page can see, not just the same scope: a
 * page shows its own offers next to its store's and its workspace's, and two of
 * those three claiming to be the default is exactly the situation the rule
 * exists to prevent.
 */
async function clearOtherDefaults(keepId: string, pageId: string | null) {
  const offer = await prisma.offer.findUnique({
    where: { id: keepId },
    select: { organizationId: true, storeId: true },
  })
  if (!offer) return

  await prisma.offer.updateMany({
    where: {
      organizationId: offer.organizationId,
      NOT: { id: keepId },
      OR: [
        ...(pageId ? [{ scope: 'PAGE' as const, pageId }] : []),
        ...(offer.storeId
          ? [{ scope: 'STORE' as const, storeId: offer.storeId }]
          : []),
        { scope: 'ORGANIZATION' as const },
      ],
    },
    data: { isDefault: false },
  })
}

/**
 * Every product in an offer must belong to this organisation.
 *
 * Offers name products by id, so without this an editor could attach another
 * tenant's product id and sell their stock.
 */
async function assertProductsInOrg(
  organizationId: string,
  items: OfferItemInput[]
) {
  if (items.length === 0) return
  const ids = [...new Set(items.map((item) => item.productId))]
  const count = await prisma.product.count({
    where: { id: { in: ids }, organizationId },
  })
  if (count !== ids.length) throw new Error('Unknown product in this offer')
}

/** The same check for every variant named by a pin, a shortlist or a rule. */
async function assertVariantsInOrg(organizationId: string, ids: string[]) {
  if (ids.length === 0) return
  const count = await prisma.productVariant.count({
    where: { id: { in: ids }, product: { organizationId } },
  })
  if (count !== ids.length)
    throw new Error('Unknown product option in this offer')
}

function collectVariantIds(input: OfferInput): string[] {
  const ids = new Set<string>()
  for (const item of input.items) {
    if (item.variantId) ids.add(item.variantId)
    for (const id of item.variantIds ?? []) ids.add(id)
  }
  for (const rule of input.variantRules ?? []) ids.add(rule.variantId)
  if (input.giftVariantId) ids.add(input.giftVariantId)
  return [...ids]
}

function scalarFields(input: OfferInput) {
  return {
    label: input.label,
    description: input.description ?? null,
    badge: input.badge ?? null,
    kind: input.kind,
    pricingMode: input.pricingMode,
    priceCents: Math.max(0, Math.round(input.priceCents)),
    discountBps: Math.max(0, Math.round(input.discountBps)),
    compareAtCents: Math.max(0, Math.round(input.compareAtCents)),
    minQuantity: Math.max(0, Math.round(input.minQuantity)),
    maxQuantity: Math.max(0, Math.round(input.maxQuantity)),
    isDefault: input.isDefault,
    isActive: input.isActive,
    tierMode: input.tierMode,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    giftVariantId: input.giftVariantId ?? null,
    giftQuantity: Math.max(1, Math.round(input.giftQuantity ?? 1)),
  }
}

function toItemCreate(item: OfferItemInput, position: number) {
  return {
    productId: item.productId,
    variantId: item.variantId,
    // A pin and a shortlist say the same thing when the shortlist is the pin,
    // so the shortlist is dropped rather than stored twice and left to drift.
    variantIds: item.variantId ? [] : [...new Set(item.variantIds ?? [])],
    quantity: Math.max(1, Math.round(item.quantity)),
    position,
  }
}

/** Deduplicated by quantity and sorted, since the ladder is keyed on it. */
function normalizeTierInput(
  tiers: {
    quantity: number
    reward: OfferTierReward
    priceCents: number
    discountBps: number
  }[]
) {
  const byQuantity = new Map<
    number,
    { reward: OfferTierReward; priceCents: number; discountBps: number }
  >()

  for (const tier of tiers) {
    const quantity = Math.round(tier.quantity)
    if (quantity < 1) continue
    byQuantity.set(quantity, {
      reward: tier.reward,
      priceCents: Math.max(0, Math.round(tier.priceCents)),
      discountBps: Math.max(0, Math.round(tier.discountBps)),
    })
  }

  return [...byQuantity.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([quantity, rung]) => ({ quantity, ...rung }))
}

/**
 * Per-size rules, with the ones that say nothing dropped.
 *
 * A row that neither excludes a size nor overrides its price is a leftover from
 * a merchant toggling a checkbox twice, and storing it would put a rule on a
 * variant that behaves exactly as if there were none.
 */
function normalizeRuleInput(rules: OfferVariantRuleInput[] | undefined) {
  const byVariant = new Map<string, OfferVariantRuleInput>()

  for (const rule of rules ?? []) {
    if (!rule.variantId) continue
    if (!rule.excluded && !rule.pricingMode) continue
    byVariant.set(rule.variantId, rule)
  }

  return [...byVariant.values()].map((rule) => ({
    variantId: rule.variantId,
    excluded: rule.excluded,
    // An excluded size is not sold at all, so a price on it would be a rule
    // nothing can ever read.
    pricingMode: rule.excluded ? null : rule.pricingMode,
    priceCents: Math.max(0, Math.round(rule.priceCents)),
    discountBps: Math.max(0, Math.round(rule.discountBps)),
  }))
}

// ── Delivery and promotions ─────────────────────────────────────────────────

export interface PageCheckoutInput {
  shippingMode: PageShippingMode
  flatRateCents: number
  askZone: boolean
  rates: { label: string; priceCents: number }[]
  freeShippingEnabled: boolean
  freeShippingMinSubtotalCents: number
  freeShippingMinQuantity: number
  discountRules: {
    basis: PromotionBasis
    thresholdCents: number
    thresholdQuantity: number
    reward: PromotionReward
    valueCents: number
    valueBps: number
    maxDiscountCents: number
    label: string | null
  }[]
}

export async function getPageCheckout(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertPageInOrg(organizationId, storeId, pageId)

  return prisma.pageCheckout.findUnique({
    where: { pageId },
    include: {
      rates: { orderBy: { position: 'asc' } },
      discountRules: { orderBy: { position: 'asc' } },
    },
  })
}

export async function savePageCheckout(
  organizationId: string,
  storeId: string,
  pageId: string,
  input: PageCheckoutInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertPageInOrg(organizationId, storeId, pageId)

  const scalars = {
    shippingMode: input.shippingMode,
    flatRateCents: Math.max(0, Math.round(input.flatRateCents)),
    askZone: input.askZone,
    freeShippingEnabled: input.freeShippingEnabled,
    freeShippingMinSubtotalCents: Math.max(
      0,
      Math.round(input.freeShippingMinSubtotalCents)
    ),
    freeShippingMinQuantity: Math.max(
      0,
      Math.round(input.freeShippingMinQuantity)
    ),
  }

  const rates = input.rates
    .filter((rate) => rate.label.trim().length > 0)
    .map((rate, position) => ({
      label: rate.label.trim(),
      priceCents: Math.max(0, Math.round(rate.priceCents)),
      position,
    }))

  const discountRules = input.discountRules.map((rule, position) => ({
    basis: rule.basis,
    thresholdCents: Math.max(0, Math.round(rule.thresholdCents)),
    thresholdQuantity: Math.max(0, Math.round(rule.thresholdQuantity)),
    reward: rule.reward,
    valueCents: Math.max(0, Math.round(rule.valueCents)),
    valueBps: Math.max(0, Math.round(rule.valueBps)),
    maxDiscountCents: Math.max(0, Math.round(rule.maxDiscountCents)),
    label: rule.label?.trim() || null,
    position,
  }))

  const checkout = await prisma.pageCheckout.upsert({
    where: { pageId },
    update: scalars,
    create: { pageId, ...scalars },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.pageShippingRate.deleteMany({ where: { checkoutId: checkout.id } }),
    prisma.pageDiscountRule.deleteMany({ where: { checkoutId: checkout.id } }),
    prisma.pageShippingRate.createMany({
      data: rates.map((rate) => ({ ...rate, checkoutId: checkout.id })),
    }),
    prisma.pageDiscountRule.createMany({
      data: discountRules.map((rule) => ({ ...rule, checkoutId: checkout.id })),
    }),
  ])
}
