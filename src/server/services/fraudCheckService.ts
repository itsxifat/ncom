import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  fraudCredentialsFor,
  markFraudAccountUsed,
} from './fraudAccountService'
import {
  checkPhoneHistory,
  type FraudHistory,
} from '@/server/courier/steadfastFraud'
import { normalizeBdPhone } from '@/server/courier/phone'
import type { CourierSettings, FraudVerdict } from '@/generated/prisma/client'

/**
 * Screening a customer before shipping goods to them.
 *
 * In a cash-on-delivery market a delivery attempt is an unsecured loan: the
 * merchant pays the courier to carry goods to someone who has promised nothing.
 * A customer who habitually refuses parcels at the door costs the delivery fee,
 * the return fee, and the working capital tied up in the meantime — every time.
 * The couriers know exactly who those customers are, because they carried the
 * parcels, so the check is simply asking them.
 *
 * The design decisions worth stating:
 *
 * Thresholds are the merchant's, not ours. What counts as an acceptable
 * delivery rate depends on price point, category and margin: 60% is fine on a
 * ৳300 item and ruinous on a ৳9,000 one. This module evaluates; it does not
 * decide what is good.
 *
 * Lookups are cached per organisation. Each lookup is a portal login, the
 * numbers behind it move over weeks not minutes, and re-checking on every order
 * would be slow, fragile and rude to the courier. Caching is per tenant because
 * the history is what *that merchant's* account can see — sharing it across
 * tenants would leak one merchant's customer history to another.
 *
 * A failed check is never a failed order. If the portal is down the verdict is
 * UNAVAILABLE and the order is queued for a human. Refusing to take orders
 * because a scraped endpoint changed its HTML would be a far worse outcome than
 * the fraud it prevents.
 */

export interface FraudAssessment {
  verdict: FraudVerdict
  /** Merchant-facing sentence explaining the verdict. */
  reason: string
  phone: string | null
  delivered: number
  cancelled: number
  frauds: number
  totalOrders: number
  successRateBps: number
  checkedAt: Date
  /** True when the numbers came from cache rather than a fresh lookup. */
  cached: boolean
}

/**
 * The rules, without the row that stores them.
 *
 * Written out rather than inferred from the defaults below, because inference
 * from a literal object narrows `false` to the type `false` and `null` to
 * `null` — which then refuses every real settings row that has the box ticked.
 */
export type CourierSettingsShape = Pick<
  CourierSettings,
  | 'autoDispatchEnabled'
  | 'fraudCheckEnabled'
  | 'minTotalParcels'
  | 'minDeliveryRateBps'
  | 'minDeliveredOrders'
  | 'maxFraudReports'
  | 'maxCancelledOrders'
  | 'allowUnknownCustomers'
  | 'manualReviewAboveCents'
  | 'dispatchDelayMinutes'
  | 'requirePaidOrders'
  | 'fraudCacheHours'
  | 'autoCancelOnFail'
>

/**
 * What a workspace that has never opened courier settings gets.
 *
 * Auto-dispatch off, screening on. A merchant should see the verdicts on their
 * orders before the platform starts acting on them unattended — trust in the
 * thresholds is earned by watching them, not by defaulting to them.
 */
const DEFAULT_SETTINGS: CourierSettingsShape = {
  autoDispatchEnabled: false,
  fraudCheckEnabled: true,
  minTotalParcels: 10,
  minDeliveredOrders: 10,
  // Off by default: the two count rules already carry most of the signal, and a
  // rate threshold on top of them is the kind of setting a merchant should turn
  // on deliberately after watching a few weeks of verdicts.
  minDeliveryRateBps: 0,
  maxFraudReports: 0,
  maxCancelledOrders: null,
  allowUnknownCustomers: true,
  manualReviewAboveCents: null,
  dispatchDelayMinutes: 0,
  requirePaidOrders: false,
  fraudCacheHours: 24,
  autoCancelOnFail: false,
}

/**
 * The organisation's rules, falling back to a conservative default set.
 *
 * A workspace that has never opened courier settings has no row, and that must
 * read as "auto-dispatch off" rather than as an error — the feature is opt-in,
 * and an absent row is the same answer as an unchecked box.
 */
export async function getCourierSettings(
  organizationId: string
): Promise<CourierSettingsShape> {
  const settings = await prisma.courierSettings.findUnique({
    where: { organizationId },
  })

  if (!settings) return { ...DEFAULT_SETTINGS }

  return {
    autoDispatchEnabled: settings.autoDispatchEnabled,
    fraudCheckEnabled: settings.fraudCheckEnabled,
    minTotalParcels: settings.minTotalParcels,
    minDeliveryRateBps: settings.minDeliveryRateBps,
    minDeliveredOrders: settings.minDeliveredOrders,
    maxFraudReports: settings.maxFraudReports,
    maxCancelledOrders: settings.maxCancelledOrders,
    allowUnknownCustomers: settings.allowUnknownCustomers,
    manualReviewAboveCents: settings.manualReviewAboveCents,
    dispatchDelayMinutes: settings.dispatchDelayMinutes,
    requirePaidOrders: settings.requirePaidOrders,
    fraudCacheHours: settings.fraudCacheHours,
    autoCancelOnFail: settings.autoCancelOnFail,
  }
}

export async function updateCourierSettings(
  organizationId: string,
  input: Partial<CourierSettingsShape>
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  // Clamped rather than validated-and-rejected: these arrive from a form with a
  // percentage slider, and a merchant who types 150% means "as strict as
  // possible", not "fail my save".
  const data = {
    ...input,
    ...(input.minDeliveryRateBps !== undefined
      ? { minDeliveryRateBps: clamp(input.minDeliveryRateBps, 0, 10_000) }
      : {}),
    ...(input.minDeliveredOrders !== undefined
      ? { minDeliveredOrders: clamp(input.minDeliveredOrders, 0, 1_000) }
      : {}),
    ...(input.minTotalParcels !== undefined
      ? { minTotalParcels: clamp(input.minTotalParcels, 0, 1_000) }
      : {}),
    ...(input.maxFraudReports !== undefined
      ? { maxFraudReports: clamp(input.maxFraudReports, 0, 1_000) }
      : {}),
    ...(input.fraudCacheHours !== undefined
      ? { fraudCacheHours: clamp(input.fraudCacheHours, 1, 720) }
      : {}),
    ...(input.dispatchDelayMinutes !== undefined
      ? { dispatchDelayMinutes: clamp(input.dispatchDelayMinutes, 0, 10_080) }
      : {}),
    ...(input.maxCancelledOrders != null
      ? { maxCancelledOrders: clamp(input.maxCancelledOrders, 0, 10_000) }
      : {}),
  }

  return prisma.courierSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...DEFAULT_SETTINGS, ...data },
    update: data,
    select: { id: true },
  })
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Delivery history for a phone number, from cache when it is fresh enough.
 *
 * `force` skips the cache, for the merchant who is looking at a suspicious
 * order right now and wants today's numbers rather than yesterday's.
 */
export async function lookupFraudHistory(
  organizationId: string,
  rawPhone: string,
  options: { force?: boolean; cacheHours?: number } = {}
): Promise<
  | { ok: true; history: FraudHistory; checkedAt: Date; cached: boolean }
  // `code` separates "you never set this up" from "the portal did not answer".
  // They look identical to a lookup and mean opposite things to an order: the
  // first is an optional feature nobody enabled, the second is a check the
  // merchant asked for that could not be run.
  | {
      ok: false
      code: 'invalid_phone' | 'not_configured' | 'lookup_failed'
      error: string
    }
> {
  const phone = normalizeBdPhone(rawPhone)
  if (!phone) {
    return {
      ok: false,
      code: 'invalid_phone',
      error: 'That is not a Bangladeshi mobile number the couriers can look up',
    }
  }

  if (!options.force) {
    const cached = await prisma.courierFraudCheck.findUnique({
      where: { organizationId_phone: { organizationId, phone } },
    })

    if (cached && cached.expiresAt > new Date()) {
      return {
        ok: true,
        cached: true,
        checkedAt: cached.checkedAt,
        history: {
          totalOrders: cached.totalOrders,
          delivered: cached.delivered,
          cancelled: cached.cancelled,
          frauds: cached.frauds,
          successRateBps: cached.successRateBps,
          consignments: Array.isArray(cached.raw)
            ? (cached.raw as unknown[])
            : [],
        },
      }
    }
  }

  const accounts = await fraudCredentialsFor(organizationId)
  if (accounts.length === 0) {
    return {
      ok: false,
      code: 'not_configured',
      error:
        'Screening needs at least one Steadfast merchant portal account under Courier & fraud',
    }
  }

  let history: FraudHistory
  try {
    const result = await checkPhoneHistory(accounts, phone)
    history = result.history
    // Records which of several accounts actually answered, so a merchant can
    // see that the third one is carrying every lookup while the first two only
    // look healthy in the test.
    void markFraudAccountUsed(organizationId, result.account)
  } catch (cause) {
    return {
      ok: false,
      code: 'lookup_failed',
      error: cause instanceof Error ? cause.message : 'The lookup failed',
    }
  }

  const cacheHours = options.cacheHours ?? 24
  const checkedAt = new Date()

  await prisma.courierFraudCheck.upsert({
    where: { organizationId_phone: { organizationId, phone } },
    create: {
      organizationId,
      phone,
      provider: 'STEADFAST',
      totalOrders: history.totalOrders,
      delivered: history.delivered,
      cancelled: history.cancelled,
      frauds: history.frauds,
      successRateBps: history.successRateBps,
      // Bounded: a customer with hundreds of parcels would otherwise put a
      // sizeable JSON blob in every cache row for no added insight.
      raw: history.consignments.slice(0, 50) as never,
      checkedAt,
      expiresAt: new Date(checkedAt.getTime() + cacheHours * 3_600_000),
    },
    update: {
      totalOrders: history.totalOrders,
      delivered: history.delivered,
      cancelled: history.cancelled,
      frauds: history.frauds,
      successRateBps: history.successRateBps,
      raw: history.consignments.slice(0, 50) as never,
      checkedAt,
      expiresAt: new Date(checkedAt.getTime() + cacheHours * 3_600_000),
    },
  })

  return { ok: true, history, checkedAt, cached: false }
}

/**
 * Applies the merchant's thresholds to a customer's history.
 *
 * Every rule must pass for an order to clear — this is an AND, not a score.
 * A weighted score would be harder to explain to the merchant standing over a
 * held order asking why, and "which rule stopped it" is the only question they
 * ever ask.
 *
 * The order of the checks is what decides the *message*, since the first rule
 * broken is the one reported. Fraud reports come first because they are the
 * strongest signal and the only rule that can FAIL rather than hold for review;
 * then the two sample-size gates, because a customer who is simply unknown
 * should be described that way rather than accused of a bad rate; then the
 * rate itself.
 */
export function evaluateHistory(
  history: FraudHistory,
  settings: CourierSettingsShape
): { verdict: FraudVerdict; reason: string } {
  if (history.frauds > settings.maxFraudReports) {
    return {
      verdict: 'FAIL',
      reason: `${history.frauds} confirmed fraud report${history.frauds === 1 ? '' : 's'} against this number (your limit is ${settings.maxFraudReports}).`,
    }
  }

  if (history.totalOrders === 0) {
    return settings.allowUnknownCustomers
      ? {
          verdict: 'PASS',
          reason:
            'No courier history for this number — treated as a new customer.',
        }
      : {
          verdict: 'REVIEW',
          reason:
            'No courier history for this number, and new customers are set to be reviewed by hand.',
        }
  }

  if (
    settings.maxCancelledOrders != null &&
    history.cancelled > settings.maxCancelledOrders
  ) {
    return {
      verdict: 'REVIEW',
      reason: `${history.cancelled} refused parcel${history.cancelled === 1 ? '' : 's'} on this number (your limit is ${settings.maxCancelledOrders}).`,
    }
  }

  // How much is known about this customer at all. A number with three parcels
  // to its name has a rate, but the rate is noise.
  if (history.totalOrders < settings.minTotalParcels) {
    return {
      verdict: 'REVIEW',
      reason: `Only ${history.totalOrders} parcel${history.totalOrders === 1 ? '' : 's'} in this customer's courier history — your rule needs at least ${settings.minTotalParcels}.`,
    }
  }

  // How many of them actually arrived. Separate from the total above because 20
  // parcels of which 2 were delivered is plenty of history and a customer worth
  // refusing.
  if (history.delivered < settings.minDeliveredOrders) {
    return {
      verdict: 'REVIEW',
      reason: `Only ${history.delivered} successful deliver${history.delivered === 1 ? 'y' : 'ies'} on record — your rule needs at least ${settings.minDeliveredOrders}.`,
    }
  }

  // Zero means the merchant is judging on counts alone.
  if (
    settings.minDeliveryRateBps > 0 &&
    history.successRateBps < settings.minDeliveryRateBps
  ) {
    return {
      verdict: 'REVIEW',
      reason: `Delivery rate ${formatBps(history.successRateBps)} is below your ${formatBps(settings.minDeliveryRateBps)} threshold (${history.delivered} delivered, ${history.cancelled} refused of ${history.totalOrders}).`,
    }
  }

  return {
    verdict: 'PASS',
    reason: `Delivery rate ${formatBps(history.successRateBps)} across ${history.totalOrders} parcels (${history.delivered} delivered, ${history.cancelled} refused).`,
  }
}

export function formatBps(bps: number): string {
  const percent = bps / 100
  // Whole percentages read better on a dashboard; fractions only appear when
  // they carry information.
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
}

/**
 * The full screen for one phone number: look up, then judge.
 *
 * Never throws. Every failure becomes an UNAVAILABLE verdict carrying the
 * reason, because the caller is a checkout path that must complete regardless
 * of whether a third-party portal is answering today.
 */
export async function screenPhone(
  organizationId: string,
  rawPhone: string | null | undefined,
  settings: CourierSettingsShape,
  options: { force?: boolean } = {}
): Promise<FraudAssessment> {
  const phone = normalizeBdPhone(rawPhone)
  const now = new Date()

  const empty = {
    phone,
    delivered: 0,
    cancelled: 0,
    frauds: 0,
    totalOrders: 0,
    successRateBps: 0,
    checkedAt: now,
    cached: false,
  }

  if (!settings.fraudCheckEnabled) {
    return {
      ...empty,
      verdict: 'PASS',
      reason: 'Fraud screening is switched off for this workspace.',
    }
  }

  if (!phone) {
    return {
      ...empty,
      verdict: 'REVIEW',
      reason:
        'No usable Bangladeshi mobile number on this order, so it could not be screened.',
    }
  }

  const lookup = await lookupFraudHistory(organizationId, phone, {
    force: options.force,
    cacheHours: settings.fraudCacheHours,
  })

  if (!lookup.ok) {
    // Screening was never set up. That is not a failed check — it is a feature
    // the merchant has not switched on, and treating it as one would hold every
    // order in a workspace that only wanted the courier dispatch half of this.
    if (lookup.code === 'not_configured') {
      return {
        ...empty,
        verdict: 'PASS',
        reason:
          'Screening is not set up — add Steadfast portal credentials in courier settings to check customers.',
      }
    }

    return { ...empty, verdict: 'UNAVAILABLE', reason: lookup.error }
  }

  const { verdict, reason } = evaluateHistory(lookup.history, settings)

  return {
    verdict,
    reason,
    phone,
    delivered: lookup.history.delivered,
    cancelled: lookup.history.cancelled,
    frauds: lookup.history.frauds,
    totalOrders: lookup.history.totalOrders,
    successRateBps: lookup.history.successRateBps,
    checkedAt: lookup.checkedAt,
    cached: lookup.cached,
  }
}

/** Manual lookup from the dashboard, for a merchant vetting a number by hand. */
export async function checkPhoneForMerchant(
  organizationId: string,
  phone: string
): Promise<FraudAssessment> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const settings = await getCourierSettings(organizationId)
  // Forced: a merchant who typed a number into a lookup box wants the answer
  // now, not the one cached this morning.
  return screenPhone(organizationId, phone, settings, { force: true })
}
