/**
 * Whether a workspace may use NCOM right now, worked out from its subscription.
 *
 * Every period a workspace holds — a trial or a paid month or year — ends on a
 * date. Before then it is fully usable. After it, the bill for the next period
 * is due: for `GRACE_HOURS` the workspace keeps working under a warning, and
 * after that it is RESTRICTED — the dashboard opens only on Billing, writes and
 * API keys are refused, and its sites show "temporarily unavailable". Paying
 * the bill moves the end date forward, and the same function then answers OK,
 * so everything comes back on the next request without anything to undo.
 *
 * Pure on purpose: worked out from the dates on every read, never stored, so
 * access cannot drift from the subscription — a missed cron run never leaves a
 * paid workspace locked, and a sweep that is late never keeps an unpaid one
 * open past its grace.
 */

/** How long a workspace keeps working after its bill falls due. */
export const GRACE_HOURS = 24

/** How long before a period ends its bill is raised and the owner is told. */
export const BILL_LEAD_DAYS = 3

const HOUR = 60 * 60 * 1000

export type RestrictionReason =
  /** Never chose a package. */
  | 'NO_PLAN'
  /** A trial ended and its first bill was not paid. */
  | 'TRIAL_ENDED'
  /** A paid period ended and its renewal was not paid. */
  | 'PAYMENT_DUE'
  /** Cancelled, or ended by an admin. */
  | 'ENDED'

export type BillingAccess =
  | {
      state: 'OK'
      /** When the current period (or trial) ends; null when it never does. */
      endsAt: Date | null
      trial: boolean
    }
  | {
      state: 'GRACE'
      reason: 'TRIAL_ENDED' | 'PAYMENT_DUE'
      dueAt: Date
      restrictsAt: Date
    }
  | {
      state: 'RESTRICTED'
      reason: RestrictionReason
      /** When the unpaid bill fell due; null when there is no bill to pay. */
      dueAt: Date | null
    }

export interface SubscriptionTimes {
  status: string
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

/** When the period a subscription is in ends: its trial, or its paid period. */
export function periodEndOf(subscription: SubscriptionTimes): Date | null {
  if (subscription.status === 'TRIALING') {
    return subscription.trialEndsAt ?? subscription.currentPeriodEnd
  }
  return subscription.currentPeriodEnd
}

export function billingAccess(
  subscription: SubscriptionTimes | null,
  now: Date = new Date()
): BillingAccess {
  if (!subscription)
    return { state: 'RESTRICTED', reason: 'NO_PLAN', dueAt: null }

  if (subscription.status === 'CANCELED' || subscription.status === 'EXPIRED') {
    return { state: 'RESTRICTED', reason: 'ENDED', dueAt: null }
  }

  const endsAt = periodEndOf(subscription)
  // Still the trial's period — also once the billing sweep has marked an
  // ended trial PAST_DUE, so the owner is told their *trial* ended rather
  // than that a bill they never had went unpaid.
  const trial =
    subscription.status === 'TRIALING' ||
    (endsAt !== null &&
      subscription.trialEndsAt !== null &&
      endsAt.getTime() === subscription.trialEndsAt.getTime())

  // No end date: a workspace an admin has put on terms of its own (a deal
  // settled off-platform). It is never billed here, so it never lapses.
  if (!endsAt || now < endsAt) return { state: 'OK', endsAt, trial }

  // Cancelled at period end: the owner chose not to renew, so there is no bill
  // to give grace for.
  if (subscription.cancelAtPeriodEnd) {
    return { state: 'RESTRICTED', reason: 'ENDED', dueAt: null }
  }

  const reason = trial ? 'TRIAL_ENDED' : 'PAYMENT_DUE'
  const restrictsAt = new Date(endsAt.getTime() + GRACE_HOURS * HOUR)
  if (now < restrictsAt) {
    return { state: 'GRACE', reason, dueAt: endsAt, restrictsAt }
  }
  return { state: 'RESTRICTED', reason, dueAt: endsAt }
}

/**
 * The same answer with restriction switched off — the platform's emergency
 * brake (`billing.restrictUnpaid`). A workspace that would be locked keeps
 * working under the overdue warning instead.
 */
export function withoutRestriction(access: BillingAccess): BillingAccess {
  if (access.state !== 'RESTRICTED' || access.dueAt === null) return access
  return {
    state: 'GRACE',
    reason: access.reason === 'TRIAL_ENDED' ? 'TRIAL_ENDED' : 'PAYMENT_DUE',
    dueAt: access.dueAt,
    restrictsAt: access.dueAt,
  }
}

/** Whole days from `now` until `date`, rounded up; 0 once it has passed. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / (24 * HOUR)))
}
