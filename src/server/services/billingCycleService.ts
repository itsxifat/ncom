import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { env } from '@/lib/env'
import { formatMoney } from '@/lib/money'
import {
  BILL_LEAD_DAYS,
  billingAccess,
  periodEndOf,
} from '@/lib/billing-access'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { raiseRenewalBill } from '@/server/services/planCheckoutService'
import { sendEmail } from '@/server/services/emailService'
import { logAudit } from '@/server/services/auditService'
import type { RenderedEmail } from '@/server/email/templates'
import {
  billReadyEmail,
  paymentOverdueEmail,
  planEndedEmail,
  workspaceRestrictedEmail,
} from '@/server/email/templates'

/**
 * The billing clock: what has to happen as periods run out.
 *
 * Run every few minutes from cron (`/api/cron/billing-cycle`). For every
 * subscription whose trial or paid period ends within `BILL_LEAD_DAYS`:
 *
 *   1. raise the bill for the next period and email the owner it is ready;
 *   2. once it falls due unpaid, mark the subscription PAST_DUE and warn that
 *      the sites go offline after the grace day;
 *   3. once the grace day is over, record the lock and tell the owner.
 *
 * It does not *enforce* anything. Whether a workspace is locked is worked out
 * from the dates on every request (lib/billing-access), so a late or missed
 * run only delays an email — it never keeps an unpaid workspace open, and
 * never keeps a paid one closed. A cancelled subscription is ended at its
 * period end instead of billed.
 *
 * Every step is idempotent: the bill is one per period, and each email has a
 * sent-at stamp on the bill, so running it twice sends nothing twice.
 */

export interface BillingCycleResult {
  checked: number
  billsRaised: number
  renewedFree: number
  reminders: number
  overdue: number
  restricted: number
  ended: number
  errors: number
}

const CANDIDATE_STATUSES = ['ACTIVE', 'PAST_DUE', 'PENDING'] as const

/** "Tue, 25 Nov, 3:00 pm" in Dhaka time, for emails. */
function dhakaLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function appUrl(path: string): string {
  return new URL(path, env.AUTH_URL).toString()
}

async function ownerEmails(organizationId: string): Promise<string[]> {
  const owners = await prisma.membership.findMany({
    where: { organizationId, role: 'OWNER' },
    select: { user: { select: { email: true } } },
  })
  return owners.map((owner) => owner.user.email).filter(Boolean) as string[]
}

async function mailOwners(
  organizationId: string,
  rendered: RenderedEmail
): Promise<void> {
  for (const to of await ownerEmails(organizationId)) {
    await sendEmail({
      purpose: 'BILLING',
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
  }
}

export async function runBillingCycle(
  now: Date = new Date()
): Promise<BillingCycleResult> {
  const result: BillingCycleResult = {
    checked: 0,
    billsRaised: 0,
    renewedFree: 0,
    reminders: 0,
    overdue: 0,
    restricted: 0,
    ended: 0,
    errors: 0,
  }
  const horizon = new Date(now.getTime() + BILL_LEAD_DAYS * 24 * 60 * 60 * 1000)
  const restrictUnpaid = await getPlatformFlag('billing.restrictUnpaid')

  const subscriptions = await prisma.subscription.findMany({
    where: {
      OR: [
        { status: 'TRIALING', trialEndsAt: { lte: horizon } },
        {
          status: 'TRIALING',
          trialEndsAt: null,
          currentPeriodEnd: { lte: horizon },
        },
        {
          status: { in: [...CANDIDATE_STATUSES] },
          currentPeriodEnd: { lte: horizon },
        },
      ],
    },
    include: {
      plan: { select: { name: true, isContactSalesOnly: true } },
      organization: { select: { name: true } },
    },
  })

  for (const subscription of subscriptions) {
    result.checked += 1
    try {
      await advance(subscription, now, restrictUnpaid, result)
    } catch (error) {
      result.errors += 1
      console.error(
        `[billing-cycle] ${subscription.organizationId}: could not advance`,
        error
      )
    }
  }
  return result
}

type Candidate = Prisma.SubscriptionGetPayload<{
  include: {
    plan: { select: { name: true; isContactSalesOnly: true } }
    organization: { select: { name: true } }
  }
}>

async function advance(
  subscription: Candidate,
  now: Date,
  restrictUnpaid: boolean,
  result: BillingCycleResult
): Promise<void> {
  const { organizationId } = subscription
  const workspaceName = subscription.organization.name
  const end = periodEndOf(subscription)
  if (!end) return

  // Cancelled at period end: nothing is billed, and at the end it simply ends.
  if (subscription.cancelAtPeriodEnd) {
    if (end > now) return
    const { count } = await prisma.subscription.updateMany({
      where: {
        id: subscription.id,
        status: { notIn: ['CANCELED', 'EXPIRED'] },
      },
      data: { status: 'EXPIRED', endedAt: now, restrictedAt: now },
    })
    if (count > 0) {
      result.ended += 1
      await logAudit(
        null,
        'plan.subscription.ended',
        'Subscription',
        subscription.id
      )
      await mailOwners(
        organizationId,
        planEndedEmail({
          workspaceName,
          planName: subscription.plan.name,
          choosePlanUrl: appUrl('/billing/plans'),
        })
      )
    }
    return
  }

  // Arranged with sales: an admin keeps these terms by hand.
  if (subscription.plan.isContactSalesOnly) return

  const bill = await raiseRenewalBill(organizationId)
  if (!bill) return
  if (bill.created) result.billsRaised += 1
  if (bill.activated) {
    result.renewedFree += 1
    return
  }

  const order = await prisma.planOrder.findUnique({
    where: { id: bill.orderId },
  })
  // Paid (or cancelled) since: nothing left to chase.
  if (!order || order.status !== 'AWAITING_PAYMENT') return

  // The first bill after a trial: due when the trial ended.
  const trial =
    subscription.status === 'TRIALING' ||
    (subscription.trialEndsAt !== null &&
      order.dueAt?.getTime() === subscription.trialEndsAt.getTime())
  const totalLabel = formatMoney(order.totalCents, order.currencyCode)
  const payUrl = appUrl('/billing')
  const access = billingAccess(subscription, now)

  if (access.state === 'OK') {
    if (order.reminderSentAt) return
    const claimed = await prisma.planOrder.updateMany({
      where: { id: order.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    })
    if (claimed.count === 0) return
    result.reminders += 1
    await mailOwners(
      organizationId,
      billReadyEmail({
        workspaceName,
        planName: subscription.plan.name,
        totalLabel,
        dueLabel: dhakaLabel(end),
        trial,
        payUrl,
      })
    )
    return
  }

  // Past due. The trial's end becomes the period's, so every later read —
  // here, the dashboard, the admin list — sees one date.
  if (subscription.status !== 'PAST_DUE') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE', currentPeriodEnd: end },
    })
  }

  if (access.state === 'GRACE') {
    if (order.overdueNoticeSentAt) return
    const claimed = await prisma.planOrder.updateMany({
      where: { id: order.id, overdueNoticeSentAt: null },
      data: { overdueNoticeSentAt: now },
    })
    if (claimed.count === 0) return
    result.overdue += 1
    await mailOwners(
      organizationId,
      paymentOverdueEmail({
        workspaceName,
        planName: subscription.plan.name,
        totalLabel,
        restrictsLabel: dhakaLabel(access.restrictsAt),
        payUrl,
      })
    )
    return
  }

  // Past the grace day. With the brake on, nothing is locked — the overdue
  // warning keeps showing instead.
  if (!restrictUnpaid) return
  if (!subscription.restrictedAt) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { restrictedAt: now },
    })
    await logAudit(
      null,
      'plan.subscription.restricted',
      'Subscription',
      subscription.id,
      {
        orderId: order.id,
      }
    )
  }
  if (order.restrictedNoticeSentAt) return
  const claimed = await prisma.planOrder.updateMany({
    where: { id: order.id, restrictedNoticeSentAt: null },
    data: { restrictedNoticeSentAt: now },
  })
  if (claimed.count === 0) return
  result.restricted += 1
  await mailOwners(
    organizationId,
    workspaceRestrictedEmail({ workspaceName, totalLabel, payUrl })
  )
}
