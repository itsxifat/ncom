import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { publishPage } from './publishService'
import type {
  OfferKind,
  OfferPricingMode,
  PageShippingMode,
  PromotionBasis,
  PromotionReward,
} from '@/generated/prisma/enums'

/**
 * Reading and writing a landing page's offers, delivery rates and promotions.
 *
 * Every mutation here ends in `refreshPublishedSnapshot`, and that is the point
 * of the module rather than an afterthought.
 *
 * The public site serves a PageVersion snapshot, not live rows, so a page
 * published before an offer changed keeps quoting the old terms until it is
 * republished. Republishing on every offer change is a few hundred
 * milliseconds of work that removes an entire class of "the price on the page
 * was wrong" support ticket.
 */

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
 * Re-snapshots the live page so what is published matches the offers.
 *
 * A draft page has no snapshot to refresh, and a failure here must not lose the
 * merchant's edit — the offer is already saved by the time this runs, so the
 * worst case is a stale card until the next publish, which is recoverable.
 */
async function refreshPublishedSnapshot(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { status: true },
  })
  if (page?.status !== 'PUBLISHED') return

  try {
    await publishPage(organizationId, storeId, pageId)
  } catch (cause) {
    console.error(
      `Offer change saved but republishing page ${pageId} failed:`,
      cause
    )
  }
}

/**
 * One offer as the builder's Offers tab edits it.
 *
 * Only ids of products and variants, not the products themselves: the panel is
 * rendered with the whole catalogue already and resolves titles, photos and
 * prices from it. That matters because this shape is also what a save returns
 * to the browser — the panel replaces its list with the server's answer so a
 * freshly created offer knows its own id — and shipping the full product graph
 * back on every keystroke-sized edit would be paying for data already on screen.
 */
export interface OfferSummaryRow {
  id: string
  key: string
  label: string
  description: string | null
  badge: string | null
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
  items: { productId: string; variantId: string | null; quantity: number }[]
  tiers: { quantity: number; priceCents: number }[]
}

export async function listOffers(
  organizationId: string,
  storeId: string,
  pageId: string
): Promise<OfferSummaryRow[]> {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertPageInOrg(organizationId, storeId, pageId)

  return prisma.offer.findMany({
    where: { pageId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      key: true,
      label: true,
      description: true,
      badge: true,
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
      items: {
        orderBy: { position: 'asc' },
        select: { productId: true, variantId: true, quantity: true },
      },
      tiers: {
        orderBy: { quantity: 'asc' },
        select: { quantity: true, priceCents: true },
      },
    },
  })
}

export interface OfferItemInput {
  productId: string
  variantId: string | null
  quantity: number
}

export interface OfferInput {
  key?: string
  label: string
  description?: string | null
  badge?: string | null
  kind: OfferKind
  pricingMode: OfferPricingMode
  priceCents: number
  discountBps: number
  compareAtCents: number
  minQuantity: number
  maxQuantity: number
  isDefault: boolean
  isActive: boolean
  items: OfferItemInput[]
  tiers: { quantity: number; priceCents: number }[]
}

/**
 * A URL-safe, human-readable key derived from the label.
 *
 * Readable because it ends up in order records a merchant reads — "family-pack"
 * tells them what sold, a cuid does not. Uniqueness within the page is enforced
 * by the database, so a collision is resolved by suffixing rather than by
 * hoping.
 */
async function uniqueOfferKey(pageId: string, label: string, exclude?: string) {
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
        pageId,
        key: candidate,
        NOT: exclude ? { id: exclude } : undefined,
      },
      select: { id: true },
    })
    if (!clash) return candidate
  }
  return `${base}-${Date.now()}`
}

export async function createOffer(
  organizationId: string,
  storeId: string,
  pageId: string,
  input: OfferInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertPageInOrg(organizationId, storeId, pageId)
  await assertProductsInOrg(organizationId, input.items)

  const position = await prisma.offer.count({ where: { pageId } })
  const key = input.key ?? (await uniqueOfferKey(pageId, input.label))

  const offer = await prisma.offer.create({
    data: {
      pageId,
      key,
      position,
      ...scalarFields(input),
      items: { create: input.items.map(toItemCreate) },
      tiers: { create: normalizeTierInput(input.tiers) },
    },
    select: { id: true },
  })

  if (input.isDefault) await clearOtherDefaults(pageId, offer.id)
  await refreshPublishedSnapshot(organizationId, storeId, pageId)
  return offer
}

export async function updateOffer(
  organizationId: string,
  storeId: string,
  pageId: string,
  offerId: string,
  input: OfferInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertPageInOrg(organizationId, storeId, pageId)
  await assertProductsInOrg(organizationId, input.items)

  const existing = await prisma.offer.findFirst({
    where: { id: offerId, pageId },
    select: { id: true },
  })
  if (!existing) throw new Error('Offer not found')

  // Items and tiers are replaced wholesale rather than diffed. They carry no
  // identity a merchant would recognise and nothing references them, so a
  // replace is both simpler and free of the "edited a line that was deleted
  // in another tab" class of bug.
  await prisma.$transaction([
    prisma.offerItem.deleteMany({ where: { offerId } }),
    prisma.offerTier.deleteMany({ where: { offerId } }),
    prisma.offer.update({
      where: { id: offerId },
      data: {
        ...scalarFields(input),
        items: { create: input.items.map(toItemCreate) },
        tiers: { create: normalizeTierInput(input.tiers) },
      },
    }),
  ])

  if (input.isDefault) await clearOtherDefaults(pageId, offerId)
  await refreshPublishedSnapshot(organizationId, storeId, pageId)
}

export async function deleteOffer(
  organizationId: string,
  storeId: string,
  pageId: string,
  offerId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertPageInOrg(organizationId, storeId, pageId)

  await prisma.offer.deleteMany({ where: { id: offerId, pageId } })
  await refreshPublishedSnapshot(organizationId, storeId, pageId)
}

export async function reorderOffers(
  organizationId: string,
  storeId: string,
  pageId: string,
  orderedIds: string[]
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertPageInOrg(organizationId, storeId, pageId)

  await prisma.$transaction(
    orderedIds.map((id, position) =>
      prisma.offer.updateMany({ where: { id, pageId }, data: { position } })
    )
  )
  await refreshPublishedSnapshot(organizationId, storeId, pageId)
}

/**
 * The offer a page preselects. Exactly one, always.
 *
 * A form with nothing chosen asks the buyer to make a decision before they can
 * begin, which is the single most expensive moment on a landing page.
 */
async function clearOtherDefaults(pageId: string, keepId: string) {
  await prisma.offer.updateMany({
    where: { pageId, NOT: { id: keepId } },
    data: { isDefault: false },
  })
}

/**
 * Every product in an offer must belong to this organisation.
 *
 * Offers are page-scoped but products are organisation-scoped, so without this
 * an editor could attach another tenant's product id and sell their stock.
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
  }
}

function toItemCreate(item: OfferItemInput, position: number) {
  return {
    productId: item.productId,
    variantId: item.variantId,
    quantity: Math.max(1, Math.round(item.quantity)),
    position,
  }
}

/** Deduplicated by quantity and sorted, since the ladder is keyed on it. */
function normalizeTierInput(tiers: { quantity: number; priceCents: number }[]) {
  const byQuantity = new Map<number, number>()
  for (const tier of tiers) {
    const quantity = Math.round(tier.quantity)
    if (quantity < 1) continue
    byQuantity.set(quantity, Math.max(0, Math.round(tier.priceCents)))
  }
  return [...byQuantity.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([quantity, priceCents]) => ({ quantity, priceCents }))
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

  await refreshPublishedSnapshot(organizationId, storeId, pageId)
}
