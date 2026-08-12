import 'server-only'
import { prisma } from '@/server/db/client'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { logAudit } from '@/server/services/auditService'
import { minorUnitsPerMajor } from '@/lib/money'
import { usagePeriodKey } from '@/lib/plans'
import {
  getMonthlyCountersByOrganization,
  getStorageByOrganization,
} from '@/server/services/usageService'
import type {
  AddonFormInput,
  CouponFormInput,
  PlanFormInput,
  SubscriptionAdminInput,
} from '@/lib/validation/plan'

/**
 * Platform-admin CRUD for the commercial model.
 *
 * Every function authorises itself with `requirePlatformAdmin` rather than
 * trusting the caller, because these are reachable as server actions and an
 * action is a public POST endpoint (see the Next.js server-actions guide). The
 * admin layout's role check is a UI affordance, not the boundary.
 *
 * Money arrives from forms in major units (৳399) and is stored in minor units
 * (39900). That conversion happens here, once, so no form has to know the
 * currency's exponent.
 */

function toMinor(amount: number, currencyCode: string): number {
  return Math.round(amount * minorUnitsPerMajor(currencyCode))
}

function toMinorOrNull(
  amount: number | null,
  currencyCode: string
): number | null {
  return amount === null ? null : toMinor(amount, currencyCode)
}

/** A datetime-local string, or null when the field was left blank. */
function toDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Comma/newline separated admin input into a clean list. */
function toList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

// ── Plans ─────────────────────────────────────────────────────────────────

export async function listPlansForAdmin() {
  await requirePlatformAdmin()
  return prisma.plan.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  })
}

export async function getPlanForAdmin(planId: string) {
  await requirePlatformAdmin()
  return prisma.plan.findUnique({ where: { id: planId } })
}

function planData(input: PlanFormInput) {
  return {
    code: input.code,
    name: input.name,
    tagline: input.tagline || null,
    position: input.position,
    isActive: input.isActive,
    isPublic: input.isPublic,
    isDefault: input.isDefault,
    isContactSalesOnly: input.isContactSalesOnly,
    currencyCode: input.currencyCode,
    monthlyPriceCents: toMinor(input.monthlyPrice, input.currencyCode),
    annualPriceCents: toMinorOrNull(input.annualPrice, input.currencyCode),
    trialDays: input.trialDays,
    maxPages: input.maxPages,
    maxStores: input.maxStores,
    maxCustomDomains: input.maxCustomDomains,
    maxTeamMembers: input.maxTeamMembers,
    storageMb: input.storageMb,
    monthlyTrafficMb: input.monthlyTrafficMb,
    monthlyVisitors: input.monthlyVisitors,
    premiumTemplates: input.premiumTemplates,
    advancedSeo: input.advancedSeo,
    googleAnalytics: input.googleAnalytics,
    metaPixel: input.metaPixel,
    googleTagManager: input.googleTagManager,
    aiContentAssistant: input.aiContentAssistant,
    advancedAnalytics: input.advancedAnalytics,
    whiteLabel: input.whiteLabel,
    dedicatedAccountManager: input.dedicatedAccountManager,
    dedicatedTechnicalSupport: input.dedicatedTechnicalSupport,
    ncomSubdomain: input.ncomSubdomain,
    dragDropBuilder: input.dragDropBuilder,
    responsiveEditor: input.responsiveEditor,
    basicTemplates: input.basicTemplates,
    basicSeo: input.basicSeo,
    sslCertificate: input.sslCertificate,
    supportTier: input.supportTier,
    fairUseNote: input.fairUseNote || null,
    enforceTrafficCap: input.enforceTrafficCap,
    enforceVisitorCap: input.enforceVisitorCap,
  }
}

export async function createPlan(input: PlanFormInput): Promise<string> {
  const session = await requirePlatformAdmin()

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.plan.create({ data: planData(input) })
    if (input.isDefault) await clearOtherDefaults(tx, created.id)
    return created
  })

  await logAudit(session.user.id, 'plan.created', 'Plan', plan.id, {
    code: plan.code,
  })
  return plan.id
}

export async function updatePlan(
  planId: string,
  input: PlanFormInput
): Promise<void> {
  const session = await requirePlatformAdmin()

  await prisma.$transaction(async (tx) => {
    await tx.plan.update({ where: { id: planId }, data: planData(input) })
    if (input.isDefault) await clearOtherDefaults(tx, planId)
  })

  await logAudit(session.user.id, 'plan.updated', 'Plan', planId, {
    code: input.code,
  })
}

/**
 * Exactly one plan may be the signup default.
 *
 * Enforced by clearing the others on write rather than by a database constraint:
 * Postgres cannot express "at most one row with isDefault = true" without a
 * partial unique index on a constant, and doing it here also means the admin
 * never sees a constraint error — ticking the box on a new plan simply moves the
 * flag, which is what they meant.
 */
async function clearOtherDefaults(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  keepPlanId: string
): Promise<void> {
  await tx.plan.updateMany({
    where: { isDefault: true, NOT: { id: keepPlanId } },
    data: { isDefault: false },
  })
}

/**
 * Deletes a plan, refusing while anyone is on it.
 *
 * Subscriptions reference the plan without a cascade, so the database would
 * refuse anyway — this turns that foreign-key error into a sentence an admin can
 * act on, and points at the fix (move them first, or just deactivate).
 */
export async function deletePlan(planId: string): Promise<void> {
  const session = await requirePlatformAdmin()

  const subscribers = await prisma.subscription.count({ where: { planId } })
  if (subscribers > 0) {
    throw new Error(
      `${subscribers} ${subscribers === 1 ? 'workspace is' : 'workspaces are'} on this plan. Move them to another plan first, or just deactivate this one.`
    )
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { code: true, isDefault: true },
  })
  if (plan?.isDefault) {
    throw new Error(
      'This is the default plan for new signups. Make another plan the default first.'
    )
  }

  await prisma.plan.delete({ where: { id: planId } })
  await logAudit(session.user.id, 'plan.deleted', 'Plan', planId, {
    code: plan?.code ?? null,
  })
}

// ── Add-ons ───────────────────────────────────────────────────────────────

export async function listAddonsForAdmin() {
  await requirePlatformAdmin()
  return prisma.addon.findMany({
    orderBy: { position: 'asc' },
    include: {
      plans: { select: { planId: true } },
      _count: { select: { subscriptionAddons: true } },
    },
  })
}

export async function getAddonForAdmin(addonId: string) {
  await requirePlatformAdmin()
  return prisma.addon.findUnique({
    where: { id: addonId },
    include: { plans: { select: { planId: true } } },
  })
}

export async function upsertAddon(
  addonId: string | null,
  input: AddonFormInput
): Promise<string> {
  const session = await requirePlatformAdmin()

  const data = {
    code: input.code,
    name: input.name,
    description: input.description || null,
    position: input.position,
    isActive: input.isActive,
    currencyCode: input.currencyCode,
    monthlyPriceCents: toMinor(input.monthlyPrice, input.currencyCode),
    annualPriceCents: toMinorOrNull(input.annualPrice, input.currencyCode),
    grantsCustomDomains: input.grantsCustomDomains,
    grantsStorageMb: input.grantsStorageMb,
    grantsTrafficMb: input.grantsTrafficMb,
    grantsTeamMembers: input.grantsTeamMembers,
    grantsFeature: input.grantsFeature,
    maxQuantity: input.maxQuantity,
    availableOnAllPlans: input.availableOnAllPlans,
  }

  const id = await prisma.$transaction(async (tx) => {
    const addon = addonId
      ? await tx.addon.update({ where: { id: addonId }, data })
      : await tx.addon.create({ data })

    // Replaced wholesale: the form submits the complete set of plans, so a merge
    // would make un-ticking one impossible.
    await tx.addonPlan.deleteMany({ where: { addonId: addon.id } })
    if (!input.availableOnAllPlans && input.planIds.length > 0) {
      await tx.addonPlan.createMany({
        data: input.planIds.map((planId) => ({ addonId: addon.id, planId })),
        skipDuplicates: true,
      })
    }

    return addon.id
  })

  await logAudit(
    session.user.id,
    addonId ? 'addon.updated' : 'addon.created',
    'Addon',
    id,
    { code: input.code }
  )
  return id
}

export async function deleteAddon(addonId: string): Promise<void> {
  const session = await requirePlatformAdmin()

  const inUse = await prisma.subscriptionAddon.count({ where: { addonId } })
  if (inUse > 0) {
    throw new Error(
      `${inUse} ${inUse === 1 ? 'workspace has' : 'workspaces have'} this add-on. Deactivate it instead so their subscription keeps working.`
    )
  }

  await prisma.addon.delete({ where: { id: addonId } })
  await logAudit(session.user.id, 'addon.deleted', 'Addon', addonId)
}

// ── Coupons ───────────────────────────────────────────────────────────────

export async function listCouponsForAdmin() {
  await requirePlatformAdmin()
  return prisma.planCoupon.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      plans: { select: { planId: true } },
      _count: { select: { redemptions: true } },
    },
  })
}

export async function getCouponForAdmin(couponId: string) {
  await requirePlatformAdmin()
  return prisma.planCoupon.findUnique({
    where: { id: couponId },
    include: { plans: { select: { planId: true } } },
  })
}

export async function upsertCoupon(
  couponId: string | null,
  input: CouponFormInput
): Promise<string> {
  const session = await requirePlatformAdmin()

  const data = {
    code: input.code,
    name: input.name || null,
    description: input.description || null,
    isActive: input.isActive,
    discountType: input.discountType,
    // Percentages are stored as basis points, so 12.5% survives the round trip.
    percentageBps:
      input.percentage === null ? null : Math.round(input.percentage * 100),
    amountCents: toMinorOrNull(input.amount, input.currencyCode),
    freeTrialDays: input.freeTrialDays,
    currencyCode: input.currencyCode,
    duration: input.duration,
    durationMonths:
      input.duration === 'REPEATING' ? input.durationMonths : null,
    appliesToAllPlans: input.appliesToAllPlans,
    appliesToAddons: input.appliesToAddons,
    allowedIntervals: input.allowedIntervals,
    newOrganizationsOnly: input.newOrganizationsOnly,
    firstPurchaseOnly: input.firstPurchaseOnly,
    existingCustomersOnly: input.existingCustomersOnly,
    existingBeforeAt: toDate(input.existingBeforeAt),
    minSubtotalCents: toMinorOrNull(input.minSubtotal, input.currencyCode),
    minTermMonths: input.minTermMonths,
    requiresVerifiedEmail: input.requiresVerifiedEmail,
    restrictedToOrganizationIds: toList(input.restrictedToOrganizationIds),
    restrictedToEmails: toList(input.restrictedToEmails).map((email) =>
      email.toLowerCase()
    ),
    restrictedToEmailDomain:
      input.restrictedToEmailDomain?.replace(/^@/, '').toLowerCase() || null,
    maxRedemptions: input.maxRedemptions,
    maxRedemptionsPerOrg: input.maxRedemptionsPerOrg,
    startsAt: toDate(input.startsAt),
    endsAt: toDate(input.endsAt),
    isStackable: input.isStackable,
  }

  const id = await prisma.$transaction(async (tx) => {
    const coupon = couponId
      ? await tx.planCoupon.update({ where: { id: couponId }, data })
      : await tx.planCoupon.create({
          data: { ...data, createdById: session.user.id },
        })

    await tx.planCouponPlan.deleteMany({ where: { couponId: coupon.id } })
    if (!input.appliesToAllPlans && input.planIds.length > 0) {
      await tx.planCouponPlan.createMany({
        data: input.planIds.map((planId) => ({ couponId: coupon.id, planId })),
        skipDuplicates: true,
      })
    }

    return coupon.id
  })

  await logAudit(
    session.user.id,
    couponId ? 'coupon.updated' : 'coupon.created',
    'PlanCoupon',
    id,
    { code: input.code }
  )
  return id
}

/**
 * Deactivates a coupon instead of deleting it when it has been used.
 *
 * A redeemed coupon is part of an order's history: deleting it would blank the
 * discount explanation on every order that used it. Unused codes are deleted
 * outright, since nothing references them.
 */
export async function deleteOrRetireCoupon(
  couponId: string
): Promise<'deleted' | 'deactivated'> {
  const session = await requirePlatformAdmin()

  const redemptions = await prisma.planCouponRedemption.count({
    where: { couponId },
  })

  if (redemptions > 0) {
    await prisma.planCoupon.update({
      where: { id: couponId },
      data: { isActive: false },
    })
    await logAudit(
      session.user.id,
      'coupon.deactivated',
      'PlanCoupon',
      couponId,
      { redemptions }
    )
    return 'deactivated'
  }

  await prisma.planCoupon.delete({ where: { id: couponId } })
  await logAudit(session.user.id, 'coupon.deleted', 'PlanCoupon', couponId)
  return 'deleted'
}

export async function listCouponRedemptions(couponId: string) {
  await requirePlatformAdmin()
  return prisma.planCouponRedemption.findMany({
    where: { couponId },
    orderBy: { redeemedAt: 'desc' },
    take: 200,
    include: { organization: { select: { name: true } } },
  })
}

// ── Subscriptions ─────────────────────────────────────────────────────────

export async function listSubscriptionsForAdmin() {
  await requirePlatformAdmin()

  return prisma.subscription.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      plan: { select: { name: true, code: true, currencyCode: true } },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { stores: true, memberships: true } },
        },
      },
      addons: { include: { addon: { select: { name: true } } } },
      coupon: { select: { code: true } },
    },
  })
}

export async function getSubscriptionForAdmin(organizationId: string) {
  await requirePlatformAdmin()
  return prisma.subscription.findUnique({
    where: { organizationId },
    include: {
      plan: true,
      organization: { select: { id: true, name: true, createdAt: true } },
      addons: { include: { addon: true } },
      coupon: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { plan: { select: { name: true } } },
      },
    },
  })
}

/**
 * Applies an admin's changes to one organisation's subscription.
 *
 * This is the "give this customer what we agreed" tool: plan, status, dates and
 * per-quota overrides in one write. It deliberately does not create a PlanOrder
 * — nothing was bought, an operator made a decision, and the audit log is where
 * that belongs.
 */
export async function updateSubscriptionAsAdmin(
  input: SubscriptionAdminInput
): Promise<void> {
  const session = await requirePlatformAdmin()

  const plan = await prisma.plan.findUnique({ where: { id: input.planId } })
  if (!plan) throw new Error('Plan not found')

  await prisma.subscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      planId: input.planId,
      interval: input.interval,
      status: input.status,
      currencyCode: plan.currencyCode,
      unitPriceCents:
        input.interval === 'ANNUAL'
          ? (plan.annualPriceCents ?? plan.monthlyPriceCents * 12)
          : plan.monthlyPriceCents,
      currentPeriodEnd: toDate(input.currentPeriodEnd),
      trialEndsAt: toDate(input.trialEndsAt),
      overrideMaxPages: input.overrideMaxPages,
      overrideMaxStores: input.overrideMaxStores,
      overrideMaxCustomDomains: input.overrideMaxCustomDomains,
      overrideMaxTeamMembers: input.overrideMaxTeamMembers,
      overrideStorageMb: input.overrideStorageMb,
      overrideMonthlyTrafficMb: input.overrideMonthlyTrafficMb,
      quotaEnforcementDisabled: input.quotaEnforcementDisabled,
      adminNote: input.adminNote || null,
    },
    update: {
      planId: input.planId,
      interval: input.interval,
      status: input.status,
      currentPeriodEnd: toDate(input.currentPeriodEnd),
      trialEndsAt: toDate(input.trialEndsAt),
      overrideMaxPages: input.overrideMaxPages,
      overrideMaxStores: input.overrideMaxStores,
      overrideMaxCustomDomains: input.overrideMaxCustomDomains,
      overrideMaxTeamMembers: input.overrideMaxTeamMembers,
      overrideStorageMb: input.overrideStorageMb,
      overrideMonthlyTrafficMb: input.overrideMonthlyTrafficMb,
      quotaEnforcementDisabled: input.quotaEnforcementDisabled,
      adminNote: input.adminNote || null,
    },
  })

  await logAudit(
    session.user.id,
    'subscription.updated',
    'Organization',
    input.organizationId,
    {
      planId: input.planId,
      status: input.status,
      quotaEnforcementDisabled: input.quotaEnforcementDisabled,
    }
  )
}

/** Adds or changes an add-on on a subscription, from the admin side. */
export async function setSubscriptionAddonAsAdmin(input: {
  organizationId: string
  addonId: string
  quantity: number
}): Promise<void> {
  const session = await requirePlatformAdmin()

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: input.organizationId },
    select: { id: true, interval: true },
  })
  if (!subscription) throw new Error('That workspace has no subscription')

  if (input.quantity <= 0) {
    await prisma.subscriptionAddon.deleteMany({
      where: { subscriptionId: subscription.id, addonId: input.addonId },
    })
  } else {
    const addon = await prisma.addon.findUnique({
      where: { id: input.addonId },
    })
    if (!addon) throw new Error('Add-on not found')

    const quantity =
      addon.maxQuantity === null
        ? input.quantity
        : Math.min(input.quantity, addon.maxQuantity)

    const unitPriceCents =
      subscription.interval === 'ANNUAL'
        ? (addon.annualPriceCents ?? addon.monthlyPriceCents * 12)
        : addon.monthlyPriceCents

    await prisma.subscriptionAddon.upsert({
      where: {
        subscriptionId_addonId: {
          subscriptionId: subscription.id,
          addonId: addon.id,
        },
      },
      create: {
        subscriptionId: subscription.id,
        addonId: addon.id,
        quantity,
        unitPriceCents,
      },
      update: { quantity, unitPriceCents },
    })
  }

  await logAudit(
    session.user.id,
    'subscription.addon.set',
    'Organization',
    input.organizationId,
    { addonId: input.addonId, quantity: input.quantity }
  )
}

// ── Orders ────────────────────────────────────────────────────────────────

export async function listPlanOrdersForAdmin(status?: 'open' | 'all') {
  await requirePlatformAdmin()

  return prisma.planOrder.findMany({
    where:
      status === 'open' ? { status: { in: ['AWAITING_PAYMENT'] } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      plan: { select: { name: true } },
      organization: { select: { id: true, name: true } },
    },
  })
}

// ── Usage ─────────────────────────────────────────────────────────────────

export interface OrganizationUsageRow {
  organizationId: string
  organizationName: string
  planName: string
  planCode: string
  quotaEnforcementDisabled: boolean
  pages: number
  stores: number
  members: number
  domains: number
  storageBytes: number
  trafficBytes: number
  visitors: number
}

/**
 * Usage for every organisation, for the admin usage tab.
 *
 * Assembled from four aggregate queries rather than per-organisation reads: with
 * a few hundred tenants the loop version is a thousand queries, and this page is
 * exactly where someone looks when the platform is already struggling.
 */
export async function getPlatformUsage(): Promise<OrganizationUsageRow[]> {
  await requirePlatformAdmin()

  const period = usagePeriodKey()

  const [organizations, storage, counters, pageCounts, domainCounts] =
    await Promise.all([
      prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { stores: true, memberships: true } },
          subscription: {
            select: {
              quotaEnforcementDisabled: true,
              plan: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      getStorageByOrganization(),
      getMonthlyCountersByOrganization(period),
      prisma.page.groupBy({ by: ['storeId'], _count: { _all: true } }),
      prisma.customDomain.groupBy({
        by: ['organizationId'],
        _count: { _all: true },
      }),
    ])

  // Pages hang off stores, so their counts have to be rolled up per
  // organisation through the store they belong to.
  const stores = await prisma.store.findMany({
    select: { id: true, organizationId: true },
  })
  const pagesByOrg = new Map<string, number>()
  for (const store of stores) {
    const count =
      pageCounts.find((row) => row.storeId === store.id)?._count._all ?? 0
    pagesByOrg.set(
      store.organizationId,
      (pagesByOrg.get(store.organizationId) ?? 0) + count
    )
  }

  const domainsByOrg = new Map(
    domainCounts.map((row) => [row.organizationId, row._count._all])
  )

  return organizations.map((organization) => ({
    organizationId: organization.id,
    organizationName: organization.name,
    planName: organization.subscription?.plan.name ?? 'No plan',
    planCode: organization.subscription?.plan.code ?? 'NONE',
    quotaEnforcementDisabled:
      organization.subscription?.quotaEnforcementDisabled ?? false,
    pages: pagesByOrg.get(organization.id) ?? 0,
    stores: organization._count.stores,
    members: organization._count.memberships,
    domains: domainsByOrg.get(organization.id) ?? 0,
    storageBytes: storage.get(organization.id) ?? 0,
    trafficBytes: counters.get(`${organization.id}:TRAFFIC_BYTES`) ?? 0,
    visitors: counters.get(`${organization.id}:VISITORS`) ?? 0,
  }))
}

/** Revenue-ish snapshot for the admin overview: what is subscribed, not billed. */
export async function getSubscriptionSummary() {
  await requirePlatformAdmin()

  const [byPlan, openOrders, activeCoupons] = await Promise.all([
    prisma.subscription.groupBy({
      by: ['planId', 'status'],
      _count: { _all: true },
      _sum: { unitPriceCents: true },
    }),
    prisma.planOrder.count({ where: { status: 'AWAITING_PAYMENT' } }),
    prisma.planCoupon.count({ where: { isActive: true } }),
  ])

  const plans = await prisma.plan.findMany({
    select: { id: true, name: true, code: true, position: true },
    orderBy: { position: 'asc' },
  })

  return {
    plans: plans.map((plan) => ({
      ...plan,
      subscribers: byPlan
        .filter((row) => row.planId === plan.id)
        .reduce((total, row) => total + row._count._all, 0),
      committedCents: byPlan
        .filter((row) => row.planId === plan.id && row.status === 'ACTIVE')
        .reduce((total, row) => total + (row._sum.unitPriceCents ?? 0), 0),
    })),
    openOrders,
    activeCoupons,
  }
}
