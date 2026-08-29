import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type {
  FeatureAvailability,
  SubscriptionInterval,
  SubscriptionStatus,
  SupportTier,
} from '@/generated/prisma/enums'
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_PLAN_COLUMN,
  QUOTA_META,
  formatQuota,
  formatUsage,
  isFeatureUsable,
  isWithinQuota,
  mbToBytes,
  type FeatureKey,
  type QuotaKey,
  type Quotas,
} from '@/lib/plans'
import {
  countCustomDomains,
  countPages,
  countStores,
  countTeamSeats,
  getUsageSnapshot,
  readCounter,
  sumStorageBytes,
  usagePeriodKey,
  type UsageSnapshot,
} from '@/server/services/usageService'

/**
 * The single answer to "what is this organisation allowed to do?".
 *
 * Every gate in the app — page creation, uploads, domains, seats, analytics
 * fields, premium templates, the public renderer's traffic cap — resolves
 * through here. That is deliberate: the alternative is each call site reading
 * plan columns itself, and then a plan edited in /admin takes effect in some
 * places and not others.
 *
 * Resolution order, applied per quota:
 *
 *   1. the plan's limit
 *   2. the subscription's override, if set (an Enterprise deal, a support bump)
 *   3. plus whatever add-ons grant
 *
 * Unlimited (null) is absorbing: once any step says unlimited, later steps
 * cannot claw it back. An add-on that grants +5 domains on top of unlimited
 * domains is still unlimited, and treating null as 0 to do the arithmetic would
 * quietly downgrade the biggest customers.
 */

export interface ResolvedEntitlements {
  organizationId: string
  subscriptionId: string | null
  planId: string
  planCode: string
  planName: string
  status: SubscriptionStatus
  interval: SubscriptionInterval
  currencyCode: string
  quotas: Quotas
  /** Usable right now: INCLUDED/LIMITED on the plan, or ADDON with the add-on bought. */
  features: Record<FeatureKey, boolean>
  /** The raw plan value, so the UI can say "Optional add-on" instead of just "no". */
  availability: Record<FeatureKey, FeatureAvailability>
  supportTier: SupportTier
  fairUseNote: string | null
  enforceTrafficCap: boolean
  enforceVisitorCap: boolean
  quotaEnforcementDisabled: boolean
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  isDefaultPlan: boolean
}

/** Raised when an action would exceed a quota. Carries what the UI needs to explain it. */
export class QuotaExceededError extends Error {
  readonly quota: QuotaKey
  readonly limit: number
  readonly used: number
  readonly planName: string

  constructor(quota: QuotaKey, limit: number, used: number, planName: string) {
    const meta = QUOTA_META[quota]
    super(
      `${meta.label} limit reached on ${planName} — ${formatUsage(used, meta.unit)} of ${formatQuota(limit, meta.unit)} used. ${meta.exceededHint}`
    )
    this.name = 'QuotaExceededError'
    this.quota = quota
    this.limit = limit
    this.used = used
    this.planName = planName
  }
}

/** Raised when a plan does not include a feature the action needs. */
export class FeatureLockedError extends Error {
  readonly feature: FeatureKey
  readonly planName: string
  readonly availableAsAddon: boolean

  constructor(
    feature: FeatureKey,
    planName: string,
    availableAsAddon: boolean
  ) {
    super(
      availableAsAddon
        ? `${FEATURE_LABELS[feature]} is available on ${planName} as an add-on — add it from Billing to switch it on.`
        : `${FEATURE_LABELS[feature]} is not included in ${planName}. Upgrade to unlock it.`
    )
    this.name = 'FeatureLockedError'
    this.feature = feature
    this.planName = planName
    this.availableAsAddon = availableAsAddon
  }
}

const subscriptionInclude = {
  plan: true,
  addons: { include: { addon: true } },
} satisfies Prisma.SubscriptionInclude

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionInclude
}>

/**
 * The plan an organisation falls back to when it has no subscription row.
 *
 * Every organisation gets one at signup, but rows created before this feature
 * existed (and any created by a path that forgets) must still resolve to
 * something. Failing closed on the free tier is the safe default: the
 * alternative is either throwing — breaking the dashboard for legacy tenants —
 * or defaulting to unlimited, which gives away the product.
 */
async function getDefaultPlan() {
  return (
    (await prisma.plan.findFirst({
      where: { isDefault: true, isActive: true },
      orderBy: { position: 'asc' },
    })) ??
    (await prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    }))
  )
}

/**
 * Ensures the organisation has a subscription, creating one on the default plan
 * if not. Called at signup and lazily by the resolver.
 */
export async function ensureSubscription(
  organizationId: string
): Promise<SubscriptionWithPlan | null> {
  const existing = await prisma.subscription.findUnique({
    where: { organizationId },
    include: subscriptionInclude,
  })
  if (existing) return existing

  const plan = await getDefaultPlan()
  if (!plan) return null

  // `create` rather than `upsert`: two concurrent first-page-loads would both
  // miss above, and the unique constraint on organizationId turns the loser
  // into a known error we can recover from by re-reading.
  try {
    return await prisma.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: plan.trialDays > 0 ? 'TRIALING' : 'ACTIVE',
        interval: 'MONTHLY',
        currencyCode: plan.currencyCode,
        unitPriceCents: plan.monthlyPriceCents,
        trialEndsAt:
          plan.trialDays > 0
            ? new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000)
            : null,
      },
      include: subscriptionInclude,
    })
  } catch {
    return prisma.subscription.findUnique({
      where: { organizationId },
      include: subscriptionInclude,
    })
  }
}

/**
 * Adds a grant to a limit, respecting unlimited.
 *
 * See the file header: null wins. `(limit ?? 0) + grant` would turn unlimited
 * into a small number, which is the one arithmetic mistake that costs money.
 */
function addGrant(limit: number | null, grant: number): number | null {
  if (limit === null) return null
  return limit + grant
}

/** An override replaces the plan's limit; absent means inherit. */
function applyOverride(
  planLimit: number | null,
  override: number | null
): number | null {
  return override === null ? planLimit : override
}

function resolveFromSubscription(
  subscription: SubscriptionWithPlan
): ResolvedEntitlements {
  const { plan } = subscription

  const quotas: Quotas = {
    PAGES: applyOverride(plan.maxPages, subscription.overrideMaxPages),
    STORES: applyOverride(plan.maxStores, subscription.overrideMaxStores),
    CUSTOM_DOMAINS: applyOverride(
      plan.maxCustomDomains,
      subscription.overrideMaxCustomDomains
    ),
    TEAM_MEMBERS: applyOverride(
      plan.maxTeamMembers,
      subscription.overrideMaxTeamMembers
    ),
    STORAGE_BYTES: mbOrNull(
      applyOverride(plan.storageMb, subscription.overrideStorageMb)
    ),
    MONTHLY_TRAFFIC_BYTES: mbOrNull(
      applyOverride(
        plan.monthlyTrafficMb,
        subscription.overrideMonthlyTrafficMb
      )
    ),
    MONTHLY_VISITORS: plan.monthlyVisitors,
  }

  const availability = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, plan[FEATURE_PLAN_COLUMN[key]]])
  ) as Record<FeatureKey, FeatureAvailability>

  const features = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, isFeatureUsable(availability[key])])
  ) as Record<FeatureKey, boolean>

  // Add-ons stack on top: quota grants multiply by quantity, feature grants
  // flip a gate on. A feature add-on only counts if the plan marked the feature
  // ADDON — buying storage does not unlock white-labelling, and a plan that
  // marks a feature UNAVAILABLE means "not sold at this tier", not "buyable".
  for (const line of subscription.addons) {
    const { addon, quantity } = line

    if (addon.grantsCustomDomains > 0) {
      quotas.CUSTOM_DOMAINS = addGrant(
        quotas.CUSTOM_DOMAINS,
        addon.grantsCustomDomains * quantity
      )
    }
    if (addon.grantsTeamMembers > 0) {
      quotas.TEAM_MEMBERS = addGrant(
        quotas.TEAM_MEMBERS,
        addon.grantsTeamMembers * quantity
      )
    }
    if (addon.grantsStorageMb > 0) {
      quotas.STORAGE_BYTES = addGrant(
        quotas.STORAGE_BYTES,
        mbToBytes(addon.grantsStorageMb * quantity)
      )
    }
    if (addon.grantsTrafficMb > 0) {
      quotas.MONTHLY_TRAFFIC_BYTES = addGrant(
        quotas.MONTHLY_TRAFFIC_BYTES,
        mbToBytes(addon.grantsTrafficMb * quantity)
      )
    }

    const unlocked = addon.grantsFeature
      ? ADDON_FEATURE_TO_KEY[addon.grantsFeature]
      : null
    if (unlocked && availability[unlocked] === 'ADDON') {
      features[unlocked] = true
    }
  }

  return {
    organizationId: subscription.organizationId,
    subscriptionId: subscription.id,
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    status: subscription.status,
    interval: subscription.interval,
    currencyCode: subscription.currencyCode,
    quotas,
    features,
    availability,
    supportTier: plan.supportTier,
    fairUseNote: plan.fairUseNote,
    enforceTrafficCap: plan.enforceTrafficCap,
    enforceVisitorCap: plan.enforceVisitorCap,
    quotaEnforcementDisabled: subscription.quotaEnforcementDisabled,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    isDefaultPlan: plan.isDefault,
  }
}

const ADDON_FEATURE_TO_KEY = {
  AI_CONTENT_ASSISTANT: 'AI_CONTENT_ASSISTANT',
  ADVANCED_ANALYTICS: 'ADVANCED_ANALYTICS',
  PREMIUM_TEMPLATES: 'PREMIUM_TEMPLATES',
  WHITE_LABEL: 'WHITE_LABEL',
} as const satisfies Record<string, FeatureKey>

function mbOrNull(mb: number | null): number | null {
  return mb === null ? null : mbToBytes(mb)
}

/**
 * Everything locked down. Used when there is not a single plan in the database
 * — a fresh install that has not been seeded — so the app renders and the admin
 * can go create plans instead of every page throwing.
 */
function lockedDownEntitlements(organizationId: string): ResolvedEntitlements {
  return {
    organizationId,
    subscriptionId: null,
    planId: '',
    planCode: 'NONE',
    planName: 'No plan',
    status: 'CANCELED',
    interval: 'MONTHLY',
    currencyCode: 'BDT',
    quotas: {
      PAGES: 0,
      STORES: 0,
      CUSTOM_DOMAINS: 0,
      TEAM_MEMBERS: 1,
      STORAGE_BYTES: 0,
      MONTHLY_TRAFFIC_BYTES: null,
      MONTHLY_VISITORS: null,
    },
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<
      FeatureKey,
      boolean
    >,
    availability: Object.fromEntries(
      FEATURE_KEYS.map((k) => [k, 'UNAVAILABLE' as FeatureAvailability])
    ) as Record<FeatureKey, FeatureAvailability>,
    supportTier: 'COMMUNITY',
    fairUseNote: null,
    enforceTrafficCap: false,
    enforceVisitorCap: false,
    quotaEnforcementDisabled: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isDefaultPlan: false,
  }
}

/**
 * Resolved entitlements for an organisation.
 *
 * Wrapped in React's `cache` so the many gates on one page render share a
 * single database read: a page listing sites, then checking whether "New site"
 * should be enabled, then rendering usage meters, would otherwise resolve the
 * same subscription three times. The cache is per-request, so an admin editing
 * a plan is never served a stale entitlement on the next request.
 */
export const getEntitlements = cache(
  async (organizationId: string): Promise<ResolvedEntitlements> => {
    const subscription = await ensureSubscription(organizationId)
    if (!subscription) return lockedDownEntitlements(organizationId)
    return resolveFromSubscription(subscription)
  }
)

/** Entitlements plus current consumption — what the billing page renders. */
export interface EntitlementsWithUsage {
  entitlements: ResolvedEntitlements
  usage: UsageSnapshot
}

export const getEntitlementsWithUsage = cache(
  async (organizationId: string): Promise<EntitlementsWithUsage> => {
    const [entitlements, usage] = await Promise.all([
      getEntitlements(organizationId),
      getUsageSnapshot(organizationId),
    ])
    return { entitlements, usage }
  }
)

/** Maps a quota to the usage figure that counts against it. */
export function usedForQuota(quota: QuotaKey, usage: UsageSnapshot): number {
  switch (quota) {
    case 'PAGES':
      return usage.pages
    case 'STORES':
      return usage.stores
    case 'CUSTOM_DOMAINS':
      return usage.customDomains
    case 'TEAM_MEMBERS':
      return usage.teamMembers
    case 'STORAGE_BYTES':
      return usage.storageBytes
    case 'MONTHLY_TRAFFIC_BYTES':
      return usage.monthlyTrafficBytes
    case 'MONTHLY_VISITORS':
      return usage.monthlyVisitors
  }
}

/**
 * Throws unless the organisation can consume `wanted` more of `quota`.
 *
 * Every creation path calls this *inside* the service that does the write, not
 * in the server action, so a quota cannot be bypassed by reaching the service
 * from a different route. Counting is live (see usageService), so this is
 * accurate even when a page was deleted a second ago.
 */
export async function requireQuota(
  organizationId: string,
  quota: QuotaKey,
  wanted = 1
): Promise<void> {
  const entitlements = await getEntitlements(organizationId)
  if (entitlements.quotaEnforcementDisabled) return

  const limit = entitlements.quotas[quota]
  if (limit === null) return

  const used = await currentUsageFor(organizationId, quota)
  if (!isWithinQuota(limit, used, wanted)) {
    throw new QuotaExceededError(quota, limit, used, entitlements.planName)
  }
}

/**
 * Checks a workspace has room for the person accepting an invitation.
 *
 * Not `requireQuota(org, 'TEAM_MEMBERS')`: that counts every pending
 * invitation as an occupied seat, including the one being accepted right now,
 * and then asks for one seat on top. On a two-seat plan a workspace with one
 * member reads as "2 of 2 used" the moment a single invitation is outstanding,
 * so the invite sends and the recipient is refused forever.
 *
 * The seat this invitation reserved is the seat the new membership takes, so it
 * is excluded from the count and charged once.
 */
export async function requireSeatForInvitation(
  organizationId: string,
  invitationId: string
): Promise<void> {
  const entitlements = await getEntitlements(organizationId)
  if (entitlements.quotaEnforcementDisabled) return

  const limit = entitlements.quotas.TEAM_MEMBERS
  if (limit === null) return

  const used = await countTeamSeats(organizationId, invitationId)
  if (!isWithinQuota(limit, used, 1)) {
    throw new QuotaExceededError(
      'TEAM_MEMBERS',
      limit,
      used,
      entitlements.planName
    )
  }
}

/**
 * Reads just the one figure a quota check needs.
 *
 * A full `getUsageSnapshot` runs nine queries; creating a page only needs to
 * know how many pages exist. On the hot path that difference is the whole cost
 * of the check.
 */
function currentUsageFor(
  organizationId: string,
  quota: QuotaKey
): Promise<number> {
  switch (quota) {
    case 'PAGES':
      return countPages(organizationId)
    case 'STORES':
      return countStores(organizationId)
    case 'CUSTOM_DOMAINS':
      return countCustomDomains(organizationId)
    case 'TEAM_MEMBERS':
      return countTeamSeats(organizationId)
    case 'STORAGE_BYTES':
      return sumStorageBytes(organizationId)
    case 'MONTHLY_TRAFFIC_BYTES':
      return readCounter(organizationId, 'TRAFFIC_BYTES', usagePeriodKey())
    case 'MONTHLY_VISITORS':
      return readCounter(organizationId, 'VISITORS', usagePeriodKey())
  }
}

/** Throws unless the organisation's plan (plus add-ons) includes `feature`. */
export async function requireFeature(
  organizationId: string,
  feature: FeatureKey
): Promise<void> {
  const entitlements = await getEntitlements(organizationId)
  if (entitlements.features[feature]) return

  throw new FeatureLockedError(
    feature,
    entitlements.planName,
    entitlements.availability[feature] === 'ADDON'
  )
}

/** Non-throwing form, for hiding UI rather than refusing an action. */
export async function hasFeature(
  organizationId: string,
  feature: FeatureKey
): Promise<boolean> {
  const entitlements = await getEntitlements(organizationId)
  return entitlements.features[feature]
}

/**
 * Whether a tenant's public sites are over their monthly allowance.
 *
 * Read by the public renderer, which serves a 503 rather than the page. That is
 * a deliberately harsh outcome, so it is gated three ways: the plan must opt in
 * (`enforceTrafficCap` / `enforceVisitorCap`), the subscription must not have
 * enforcement disabled, and the quota must not be unlimited.
 */
export async function isOverTrafficAllowance(
  organizationId: string
): Promise<{ over: boolean; reason: 'traffic' | 'visitors' | null }> {
  const entitlements = await getEntitlements(organizationId)
  if (entitlements.quotaEnforcementDisabled)
    return { over: false, reason: null }

  const period = usagePeriodKey()

  const trafficLimit = entitlements.quotas.MONTHLY_TRAFFIC_BYTES
  if (entitlements.enforceTrafficCap && trafficLimit !== null) {
    const used = await readCounter(organizationId, 'TRAFFIC_BYTES', period)
    if (used >= trafficLimit) return { over: true, reason: 'traffic' }
  }

  const visitorLimit = entitlements.quotas.MONTHLY_VISITORS
  if (entitlements.enforceVisitorCap && visitorLimit !== null) {
    const used = await readCounter(organizationId, 'VISITORS', period)
    if (used >= visitorLimit) return { over: true, reason: 'visitors' }
  }

  return { over: false, reason: null }
}
