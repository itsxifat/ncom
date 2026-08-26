import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import type { CreateDiscountInput } from '@/lib/validation/discount'

/**
 * Discount campaigns.
 *
 * A Discount is the rule; DiscountCode rows are the strings shoppers type. One
 * rule can carry many codes, which is how a single campaign runs per-influencer
 * or per-channel codes that all report back to the same promotion.
 */

export async function listDiscounts(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.discount.findMany({
    where: { organizationId },
    include: { codes: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDiscount(organizationId: string, discountId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const discount = await prisma.discount.findFirst({
    where: { id: discountId, organizationId },
    include: { codes: true },
  })
  if (!discount) throw new Error('Discount not found')

  return discount
}

export async function createDiscount(
  organizationId: string,
  input: CreateDiscountInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  await assertStoresInOrg(organizationId, input.storeIds)
  await assertCodesAreFree(organizationId, input.codes)

  return prisma.discount.create({
    data: {
      organizationId,
      title: input.title,
      method: input.method,
      type: input.type,
      valueBps: input.valueBps ?? null,
      valueCents: input.valueCents ?? null,
      maxDiscountCents: input.maxDiscountCents ?? null,
      storeIds: input.storeIds,
      appliesTo: input.appliesTo,
      targetProductIds: input.targetProductIds,
      targetCollectionIds: input.targetCollectionIds,
      targetVariantIds: input.targetVariantIds,
      excludedProductIds: input.excludedProductIds,
      excludedVariantIds: input.excludedVariantIds,
      minimumSubtotalCents: input.minimumSubtotalCents ?? null,
      minimumQuantity: input.minimumQuantity ?? null,
      buyQuantity: input.buyQuantity ?? null,
      getQuantity: input.getQuantity ?? null,
      usageLimit: input.usageLimit ?? null,
      oncePerCustomer: input.oncePerCustomer,
      combinesWithOther: input.combinesWithOther,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      isActive: input.isActive,
      codes: {
        // Stored uppercase; lookups compare case-insensitively so a shopper
        // typing "save10" still matches.
        create: input.codes.map((code) => ({ code: code.toUpperCase() })),
      },
    },
    include: { codes: true },
  })
}

export async function updateDiscount(
  organizationId: string,
  discountId: string,
  input: CreateDiscountInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const existing = await prisma.discount.findFirst({
    where: { id: discountId, organizationId },
    select: { id: true },
  })
  if (!existing) throw new Error('Discount not found')

  await assertStoresInOrg(organizationId, input.storeIds)
  await assertCodesAreFree(organizationId, input.codes, discountId)

  return prisma.$transaction(async (tx) => {
    const current = await tx.discountCode.findMany({
      where: { discountId },
      select: { id: true, code: true },
    })

    const desired = new Set(input.codes.map((code) => code.toUpperCase()))
    const currentByCode = new Map(current.map((row) => [row.code, row]))

    const toDelete = current.filter((row) => !desired.has(row.code))
    if (toDelete.length > 0) {
      await tx.discountCode.deleteMany({
        where: { id: { in: toDelete.map((row) => row.id) } },
      })
    }

    // Existing codes are left untouched rather than recreated, so their
    // per-code usageCount survives an edit to the campaign.
    const toCreate = [...desired].filter((code) => !currentByCode.has(code))
    if (toCreate.length > 0) {
      await tx.discountCode.createMany({
        data: toCreate.map((code) => ({ discountId, code })),
      })
    }

    return tx.discount.update({
      where: { id: discountId },
      data: {
        title: input.title,
        method: input.method,
        type: input.type,
        valueBps: input.valueBps ?? null,
        valueCents: input.valueCents ?? null,
        maxDiscountCents: input.maxDiscountCents ?? null,
        storeIds: input.storeIds,
        appliesTo: input.appliesTo,
        targetProductIds: input.targetProductIds,
        targetCollectionIds: input.targetCollectionIds,
        targetVariantIds: input.targetVariantIds,
        excludedProductIds: input.excludedProductIds,
        excludedVariantIds: input.excludedVariantIds,
        minimumSubtotalCents: input.minimumSubtotalCents ?? null,
        minimumQuantity: input.minimumQuantity ?? null,
        buyQuantity: input.buyQuantity ?? null,
        getQuantity: input.getQuantity ?? null,
        usageLimit: input.usageLimit ?? null,
        oncePerCustomer: input.oncePerCustomer,
        combinesWithOther: input.combinesWithOther,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        isActive: input.isActive,
      },
      include: { codes: true },
    })
  })
}

/**
 * Every store a discount is limited to must be one of this workspace's.
 *
 * An empty list means "all of them" and needs no check. A non-empty one names
 * ids the browser supplied, so without this a merchant could scope a campaign
 * onto another tenant's storefront — which would not let them read anything,
 * but would make the discount silently apply nowhere and be undebuggable.
 */
async function assertStoresInOrg(organizationId: string, storeIds: string[]) {
  if (storeIds.length === 0) return

  const count = await prisma.store.count({
    where: { id: { in: storeIds }, organizationId },
  })
  if (count !== storeIds.length) {
    throw new Error('One of the chosen stores is not part of this workspace')
  }
}

/**
 * Codes are unique per store, not globally — two different merchants may both
 * run "SUMMER20" and neither should block the other.
 */
async function assertCodesAreFree(
  organizationId: string,
  codes: string[],
  excludeDiscountId?: string
) {
  if (codes.length === 0) return

  const clash = await prisma.discountCode.findFirst({
    where: {
      code: { in: codes.map((code) => code.toUpperCase()) },
      discount: {
        organizationId,
        id: excludeDiscountId ? { not: excludeDiscountId } : undefined,
      },
    },
    select: { code: true },
  })

  if (clash) {
    throw new Error(`The code ${clash.code} is already in use in this store`)
  }
}

export async function setDiscountActive(
  organizationId: string,
  discountId: string,
  isActive: boolean
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const discount = await prisma.discount.findFirst({
    where: { id: discountId, organizationId },
    select: { id: true },
  })
  if (!discount) throw new Error('Discount not found')

  return prisma.discount.update({
    where: { id: discountId },
    data: { isActive },
  })
}

export async function deleteDiscount(
  organizationId: string,
  discountId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const discount = await prisma.discount.findFirst({
    where: { id: discountId, organizationId },
    select: { id: true, usageCount: true },
  })
  if (!discount) throw new Error('Discount not found')

  // Orders record the code they used as a plain string, so deleting a redeemed
  // discount does not corrupt order history — but it does destroy the campaign
  // reporting, which merchants rarely intend.
  if (discount.usageCount > 0) {
    throw new Error(
      'This discount has been redeemed — deactivate it instead of deleting'
    )
  }

  await prisma.discount.delete({ where: { id: discountId } })
}
