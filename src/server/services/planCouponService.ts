import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { SubscriptionInterval } from '@/generated/prisma/enums'
import { applyBps, clampNonNegative } from '@/lib/money'

/**
 * Platform coupon evaluation.
 *
 * One function decides whether a code applies and what it is worth, and it is
 * the only place that decides. Checkout, the admin "test this coupon" tool and
 * renewal all call `evaluateCoupon`, so a rule cannot be enforced at checkout
 * and forgotten at renewal — which is how coupons quietly become permanent.
 *
 * Every eligibility rule is ANDed and every failure returns a reason the tenant
 * can act on. "This code isn't valid" for all twelve rejection paths is the
 * fastest way to generate support tickets, so the reasons are specific — while
 * still never revealing that a code exists but is reserved for someone else.
 */

export type CouponRejection =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'ALREADY_USED'
  | 'PLAN_NOT_ELIGIBLE'
  | 'INTERVAL_NOT_ELIGIBLE'
  | 'NOT_NEW_CUSTOMER'
  | 'NOT_FIRST_PURCHASE'
  | 'NOT_EXISTING_CUSTOMER'
  | 'BELOW_MINIMUM'
  | 'TERM_TOO_SHORT'
  | 'EMAIL_NOT_VERIFIED'
  | 'NOT_ELIGIBLE'
  | 'CURRENCY_MISMATCH'

const REJECTION_MESSAGES: Record<CouponRejection, string> = {
  NOT_FOUND: "That code doesn't exist.",
  INACTIVE: 'That code is no longer active.',
  NOT_STARTED: "That code isn't active yet.",
  EXPIRED: 'That code has expired.',
  EXHAUSTED: 'That code has reached its redemption limit.',
  ALREADY_USED: "You've already used that code.",
  PLAN_NOT_ELIGIBLE: "That code doesn't apply to this plan.",
  INTERVAL_NOT_ELIGIBLE:
    "That code doesn't apply to this billing period. Try switching monthly/annual.",
  NOT_NEW_CUSTOMER: 'That code is for first-time subscribers only.',
  NOT_FIRST_PURCHASE: 'That code is for a first purchase only.',
  NOT_EXISTING_CUSTOMER: 'That code is reserved for existing customers.',
  BELOW_MINIMUM: "This order doesn't reach that code's minimum.",
  TERM_TOO_SHORT: 'That code requires a longer billing term.',
  EMAIL_NOT_VERIFIED: 'Verify your email address to use that code.',
  NOT_ELIGIBLE: "That code isn't available on this account.",
  CURRENCY_MISMATCH: 'That code is issued in a different currency.',
}

export function couponRejectionMessage(reason: CouponRejection): string {
  return REJECTION_MESSAGES[reason]
}

export interface CouponContext {
  organizationId: string
  planId: string
  interval: SubscriptionInterval
  /** The plan's own price for the chosen interval, in minor units. */
  planSubtotalCents: number
  /** Add-on lines total for the same interval. */
  addonSubtotalCents: number
  currencyCode: string
  /** The signed-in user, for the email and verification rules. */
  userEmail?: string | null
  userEmailVerified?: boolean
}

export interface CouponEvaluation {
  couponId: string
  code: string
  description: string | null
  discountCents: number
  /** Extra trial days granted (FREE_TRIAL_DAYS coupons only). */
  trialDays: number
  /** How many billing periods the discount survives; null = forever. */
  periodsRemaining: number | null
  /** Human summary for the checkout line: "100% off, forever". */
  summary: string
}

export type CouponResult =
  | { ok: true; evaluation: CouponEvaluation }
  | { ok: false; reason: CouponRejection; message: string }

function reject(reason: CouponRejection): CouponResult {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] }
}

const couponInclude = { plans: true } satisfies Prisma.PlanCouponInclude
type CouponWithPlans = Prisma.PlanCouponGetPayload<{
  include: typeof couponInclude
}>

/** Codes are stored upper-cased so lookups are case-insensitive without a scan. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function evaluateCoupon(
  rawCode: string,
  context: CouponContext
): Promise<CouponResult> {
  const code = normalizeCouponCode(rawCode)
  if (!code) return reject('NOT_FOUND')

  const coupon = await prisma.planCoupon.findUnique({
    where: { code },
    include: couponInclude,
  })
  if (!coupon) return reject('NOT_FOUND')

  return evaluateLoadedCoupon(coupon, context)
}

/**
 * The rule engine proper, split out so the admin's "test against this account"
 * tool can evaluate a coupon it already loaded without a second lookup.
 */
export async function evaluateLoadedCoupon(
  coupon: CouponWithPlans,
  context: CouponContext
): Promise<CouponResult> {
  const now = new Date()

  if (!coupon.isActive) return reject('INACTIVE')
  if (coupon.startsAt && coupon.startsAt > now) return reject('NOT_STARTED')
  if (coupon.endsAt && coupon.endsAt < now) return reject('EXPIRED')

  if (
    coupon.maxRedemptions !== null &&
    coupon.redeemedCount >= coupon.maxRedemptions
  ) {
    return reject('EXHAUSTED')
  }

  if (coupon.maxRedemptionsPerOrg !== null) {
    const usedByOrg = await prisma.planCouponRedemption.count({
      where: { couponId: coupon.id, organizationId: context.organizationId },
    })
    if (usedByOrg >= coupon.maxRedemptionsPerOrg) return reject('ALREADY_USED')
  }

  if (!coupon.appliesToAllPlans) {
    const eligible = coupon.plans.some((row) => row.planId === context.planId)
    if (!eligible) return reject('PLAN_NOT_ELIGIBLE')
  }

  if (
    coupon.allowedIntervals.length > 0 &&
    !coupon.allowedIntervals.includes(context.interval)
  ) {
    return reject('INTERVAL_NOT_ELIGIBLE')
  }

  // "New customer" means never having had a paid plan activated — not a young
  // account. An organisation that has been on Free for two years is still a new
  // customer the first time it subscribes, and that is exactly who a launch
  // code is aimed at.
  if (coupon.newOrganizationsOnly) {
    const paidBefore = await prisma.planOrder.count({
      where: {
        organizationId: context.organizationId,
        status: { in: ['PAID', 'ACTIVATED', 'AUTO_ACTIVATED'] },
        totalCents: { gt: 0 },
      },
    })
    if (paidBefore > 0) return reject('NOT_NEW_CUSTOMER')
  }

  // Stricter than the above: no checkout of any kind has happened before,
  // successful or not.
  if (coupon.firstPurchaseOnly) {
    const anyOrder = await prisma.planOrder.count({
      where: { organizationId: context.organizationId },
    })
    if (anyOrder > 0) return reject('NOT_FIRST_PURCHASE')
  }

  // The onboarding case: a code only the tenants who were already here may use.
  // With no explicit cutoff, the coupon's own creation time is the line — the
  // accounts that existed when the offer was written.
  if (coupon.existingCustomersOnly) {
    const cutoff = coupon.existingBeforeAt ?? coupon.createdAt
    const organization = await prisma.organization.findUnique({
      where: { id: context.organizationId },
      select: { createdAt: true },
    })
    if (!organization || organization.createdAt >= cutoff) {
      return reject('NOT_EXISTING_CUSTOMER')
    }
  }

  const discountBase =
    context.planSubtotalCents +
    (coupon.appliesToAddons ? context.addonSubtotalCents : 0)

  if (
    coupon.minSubtotalCents !== null &&
    discountBase < coupon.minSubtotalCents
  ) {
    return reject('BELOW_MINIMUM')
  }

  const termMonths = context.interval === 'ANNUAL' ? 12 : 1
  if (coupon.minTermMonths !== null && termMonths < coupon.minTermMonths) {
    return reject('TERM_TOO_SHORT')
  }

  if (coupon.requiresVerifiedEmail && !context.userEmailVerified) {
    return reject('EMAIL_NOT_VERIFIED')
  }

  if (
    coupon.restrictedToOrganizationIds.length > 0 &&
    !coupon.restrictedToOrganizationIds.includes(context.organizationId)
  ) {
    return reject('NOT_ELIGIBLE')
  }

  const email = context.userEmail?.trim().toLowerCase() ?? null

  if (coupon.restrictedToEmails.length > 0) {
    const allowed = coupon.restrictedToEmails.map((e) => e.trim().toLowerCase())
    if (!email || !allowed.includes(email)) return reject('NOT_ELIGIBLE')
  }

  if (coupon.restrictedToEmailDomain) {
    const domain = coupon.restrictedToEmailDomain
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
    if (!email || !email.endsWith(`@${domain}`)) return reject('NOT_ELIGIBLE')
  }

  // A fixed amount in one currency cannot be subtracted from a price in
  // another. Percentages are currency-agnostic, so they are exempt.
  const needsSameCurrency =
    coupon.discountType === 'FIXED_AMOUNT' ||
    coupon.discountType === 'OVERRIDE_PRICE'
  if (
    needsSameCurrency &&
    coupon.currencyCode.toUpperCase() !== context.currencyCode.toUpperCase()
  ) {
    return reject('CURRENCY_MISMATCH')
  }

  const { discountCents, trialDays } = computeDiscount(coupon, {
    discountBase,
    planSubtotalCents: context.planSubtotalCents,
  })

  return {
    ok: true,
    evaluation: {
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountCents,
      trialDays,
      periodsRemaining: periodsFor(coupon),
      summary: describeCoupon(coupon),
    },
  }
}

function computeDiscount(
  coupon: CouponWithPlans,
  amounts: { discountBase: number; planSubtotalCents: number }
): { discountCents: number; trialDays: number } {
  const { discountBase, planSubtotalCents } = amounts

  switch (coupon.discountType) {
    case 'FREE':
      return { discountCents: discountBase, trialDays: 0 }

    case 'PERCENTAGE':
      return {
        discountCents: Math.min(
          discountBase,
          applyBps(discountBase, coupon.percentageBps ?? 0)
        ),
        trialDays: 0,
      }

    case 'FIXED_AMOUNT':
      return {
        discountCents: Math.min(discountBase, coupon.amountCents ?? 0),
        trialDays: 0,
      }

    // "Pay exactly this much." The target price replaces the plan's own price,
    // so the discount is the difference — and add-ons are only pulled in when
    // the coupon says it covers them.
    case 'OVERRIDE_PRICE': {
      const target = coupon.amountCents ?? 0
      const overridable = coupon.appliesToAddons
        ? discountBase
        : planSubtotalCents
      return {
        discountCents: clampNonNegative(overridable - target),
        trialDays: 0,
      }
    }

    case 'FREE_TRIAL_DAYS':
      return { discountCents: 0, trialDays: coupon.freeTrialDays ?? 0 }
  }
}

function periodsFor(coupon: CouponWithPlans): number | null {
  switch (coupon.duration) {
    case 'ONCE':
      return 1
    case 'REPEATING':
      return coupon.durationMonths ?? 1
    case 'FOREVER':
      return null
  }
}

/** One-line description used on the checkout summary and in the admin list. */
export function describeCoupon(coupon: {
  discountType: CouponWithPlans['discountType']
  percentageBps: number | null
  amountCents: number | null
  freeTrialDays: number | null
  duration: CouponWithPlans['duration']
  durationMonths: number | null
  currencyCode: string
}): string {
  const scope =
    coupon.duration === 'FOREVER'
      ? 'forever'
      : coupon.duration === 'ONCE'
        ? 'first period'
        : `${coupon.durationMonths ?? 1} periods`

  switch (coupon.discountType) {
    case 'FREE':
      return `100% off, ${scope}`
    case 'PERCENTAGE':
      return `${(coupon.percentageBps ?? 0) / 100}% off, ${scope}`
    case 'FIXED_AMOUNT':
      return `${(coupon.amountCents ?? 0) / 100} ${coupon.currencyCode} off, ${scope}`
    case 'OVERRIDE_PRICE':
      return `Fixed price ${(coupon.amountCents ?? 0) / 100} ${coupon.currencyCode}, ${scope}`
    case 'FREE_TRIAL_DAYS':
      return `${coupon.freeTrialDays ?? 0}-day free trial`
  }
}

/**
 * Records a redemption and consumes one of the coupon's uses.
 *
 * Takes a transaction client because it must commit with the PlanOrder that
 * caused it: a redemption written outside the order's transaction can survive a
 * rolled-back checkout, permanently burning a single-use code the tenant never
 * got to use.
 *
 * The global cap is re-checked here rather than trusting the evaluation above:
 * two tenants redeeming the last use of a code at the same instant both pass
 * evaluation, and only a guard at write time stops the second one.
 *
 * Raw SQL because the check compares two columns of the same row
 * (`redeemedCount < maxRedemptions`), which Prisma's filter language cannot
 * express. Doing it as increment-then-verify-then-maybe-decrement would work
 * but leaves a window where the count is over cap, and the compensating write
 * can fail on its own.
 */
export async function redeemCoupon(
  tx: Prisma.TransactionClient,
  input: {
    couponId: string
    organizationId: string
    subscriptionId?: string | null
    planOrderId?: string | null
    discountCents: number
  }
): Promise<boolean> {
  const consumed = await tx.$executeRaw`
    UPDATE "PlanCoupon"
    SET "redeemedCount" = "redeemedCount" + 1
    WHERE id = ${input.couponId}
      AND "isActive" = true
      AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")
  `

  if (consumed === 0) return false

  await tx.planCouponRedemption.create({
    data: {
      couponId: input.couponId,
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId ?? null,
      planOrderId: input.planOrderId ?? null,
      discountCents: input.discountCents,
    },
  })

  return true
}
