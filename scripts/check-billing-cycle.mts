/**
 * Proves the billing clock does what owners are told it does.
 *
 *   **Access is decided by the dates alone.** OK before a period ends, a grace
 *   day after, then locked — and the emergency brake turns the lock back into
 *   a warning.
 *
 *   **A trial runs into a bill.** A few days before it ends the bill is raised
 *   once; when it falls due the workspace is PAST_DUE; after the grace day it is
 *   locked — and paying it opens everything again at once, starting the paid
 *   period from the payment (the unpaid days are not given away).
 *
 *   **Paying on time loses nothing.** A renewal paid before the period ends
 *   starts the next one where the current one stops.
 *
 *   **Cancelled means ended.** No bill, and at the end the workspace is locked.
 *
 *   **One trial.** A workspace that used its trial, or paid, cannot start another.
 *
 * Runs against the dev database (packages from scripts/apply-plan-lineup.mts),
 * on one throwaway workspace that it deletes again:
 *
 *   pnpm check:billing-cycle
 *
 * `server-only` is stubbed by the npm script (scripts/support/no-server-only.cjs):
 * the react-server condition other checks use would load React's server build,
 * which the auth stack this reaches cannot run on.
 */

import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db/client'
import {
  billingAccess,
  withoutRestriction,
  GRACE_HOURS,
  type SubscriptionTimes,
} from '@/lib/billing-access'
import { runBillingCycle } from '@/server/services/billingCycleService'
import {
  activateOrder,
  raiseRenewalBill,
  trialEligibility,
} from '@/server/services/planCheckoutService'
import { getEntitlements } from '@/server/services/entitlementService'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}`, detail ?? '')
  }
}

function pureChecks() {
  console.log('Access from dates')
  const end = new Date('2026-12-01T00:00:00Z')
  const trial: SubscriptionTimes = {
    status: 'TRIALING',
    trialEndsAt: end,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
  }
  const at = (ms: number) => new Date(end.getTime() + ms)

  check('trial running → OK', billingAccess(trial, at(-HOUR)).state === 'OK')
  const grace = billingAccess(trial, at(HOUR))
  check(
    'trial just ended → GRACE (TRIAL_ENDED)',
    grace.state === 'GRACE' && grace.reason === 'TRIAL_ENDED'
  )
  check(
    `grace lasts ${GRACE_HOURS}h`,
    billingAccess(trial, at(GRACE_HOURS * HOUR - 1)).state === 'GRACE' &&
      billingAccess(trial, at(GRACE_HOURS * HOUR)).state === 'RESTRICTED'
  )
  const marked = billingAccess({ ...trial, status: 'PAST_DUE' }, at(2 * DAY))
  check(
    'ended trial marked PAST_DUE still reads TRIAL_ENDED',
    marked.state === 'RESTRICTED' && marked.reason === 'TRIAL_ENDED'
  )
  const paid = { ...trial, status: 'ACTIVE', trialEndsAt: null }
  const due = billingAccess(paid, at(2 * DAY))
  check(
    'paid period over, unpaid → RESTRICTED (PAYMENT_DUE)',
    due.state === 'RESTRICTED' && due.reason === 'PAYMENT_DUE'
  )
  check(
    'brake off → warning instead of lock',
    withoutRestriction(due).state === 'GRACE'
  )
  check(
    'no end date → never lapses',
    billingAccess({ ...paid, currentPeriodEnd: null }, at(365 * DAY)).state ===
      'OK'
  )
  const cancelled = billingAccess(
    { ...paid, cancelAtPeriodEnd: true },
    at(HOUR)
  )
  check(
    'cancelled at period end → RESTRICTED (ENDED), no grace',
    cancelled.state === 'RESTRICTED' && cancelled.reason === 'ENDED'
  )
  const none = billingAccess(null)
  check(
    'no subscription → RESTRICTED (NO_PLAN)',
    none.state === 'RESTRICTED' && none.reason === 'NO_PLAN'
  )
}

async function lifecycleChecks() {
  const plan = await prisma.plan.findUnique({ where: { code: 'STARTER' } })
  if (!plan) throw new Error('Run scripts/apply-plan-lineup.mts --apply first')

  const suffix = randomUUID().slice(0, 8)
  const user = await prisma.user.create({
    data: { email: `billing-check-${suffix}@example.test`, name: 'Billing check' },
  })
  const org = await prisma.organization.create({
    data: { name: `Billing check ${suffix}`, slug: `billing-check-${suffix}` },
  })
  await prisma.membership.create({
    data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
  })

  try {
    console.log('\nA fresh workspace')
    check(
      'has no package and is locked (NO_PLAN)',
      (await getEntitlements(org.id)).access.state === 'RESTRICTED'
    )
    check(
      'may start a trial',
      (await trialEligibility(org.id, user.id)).eligible
    )

    // A trial that ended 30 hours ago, started 7 days before that — what
    // startTrial writes, back-dated so the real clock sees it as overdue.
    const now = new Date()
    const trialEnd = new Date(now.getTime() - 30 * HOUR)
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan.id,
        status: 'TRIALING',
        interval: 'MONTHLY',
        currencyCode: plan.currencyCode,
        unitPriceCents: plan.monthlyPriceCents,
        currentPeriodStart: new Date(trialEnd.getTime() - 7 * DAY),
        currentPeriodEnd: trialEnd,
        trialEndsAt: trialEnd,
        trialUsedAt: new Date(trialEnd.getTime() - 7 * DAY),
      },
    })
    await prisma.planOrder.create({
      data: {
        organizationId: org.id,
        subscriptionId: subscription.id,
        planId: plan.id,
        interval: 'MONTHLY',
        subtotalCents: 0,
        totalCents: 0,
        status: 'AUTO_ACTIVATED',
        kind: 'TRIAL',
        dueAt: trialEnd,
        lineItems: [],
        createdById: user.id,
      },
    })

    console.log('\nThe trial runs into its bill')
    const before = await runBillingCycle(new Date(trialEnd.getTime() - 2 * DAY))
    const bills = () =>
      prisma.planOrder.findMany({
        where: { organizationId: org.id, kind: 'RENEWAL' },
        orderBy: { createdAt: 'asc' },
      })
    let [bill] = await bills()
    check('2 days before the end: bill raised', before.billsRaised >= 1 && !!bill)
    check(
      'bill is the package price, due when the trial ends',
      bill?.subtotalCents === plan.monthlyPriceCents &&
        bill?.dueAt?.getTime() === trialEnd.getTime() &&
        bill?.status === 'AWAITING_PAYMENT'
    )
    check('reminder sent once', !!bill?.reminderSentAt)
    await runBillingCycle(new Date(trialEnd.getTime() - DAY))
    check('a second sweep raises no second bill', (await bills()).length === 1)

    await runBillingCycle(new Date(trialEnd.getTime() + HOUR))
    let sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    })
    ;[bill] = await bills()
    check('an hour after the end: PAST_DUE', sub.status === 'PAST_DUE')
    check('overdue notice sent', !!bill?.overdueNoticeSentAt)

    await runBillingCycle(now)
    sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    })
    ;[bill] = await bills()
    check('after the grace day: lock recorded', !!sub.restrictedAt)
    check('lock notice sent', !!bill?.restrictedNoticeSentAt)
    const locked = await getEntitlements(org.id)
    check(
      'workspace is locked now (TRIAL_ENDED)',
      locked.access.state === 'RESTRICTED' &&
        locked.access.reason === 'TRIAL_ENDED',
      locked.access
    )

    console.log('\nPaying the bill')
    const paidAt = Date.now()
    await activateOrder(bill!.id, { actorUserId: null, markPaid: true })
    sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    })
    check('subscription ACTIVE again', sub.status === 'ACTIVE')
    check('lock cleared', sub.restrictedAt === null)
    check(
      'paid late: the new month starts at the payment',
      Math.abs(sub.currentPeriodStart.getTime() - paidAt) < 60_000
    )
    check(
      'workspace usable again',
      (await getEntitlements(org.id)).access.state === 'OK'
    )
    check(
      'no second trial after paying',
      !(await trialEligibility(org.id, user.id)).eligible
    )

    console.log('\nRenewing on time')
    const periodEnd = new Date(Date.now() + 2 * DAY)
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: periodEnd },
    })
    await runBillingCycle()
    const renewal = (await bills()).at(-1)!
    check(
      'next bill raised for the period end',
      renewal.id !== bill!.id && renewal.dueAt?.getTime() === periodEnd.getTime()
    )
    await activateOrder(renewal.id, { actorUserId: null, markPaid: true })
    sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    })
    check(
      'paid early: the next period starts where this one ends',
      sub.currentPeriodStart.getTime() === periodEnd.getTime() &&
        (sub.currentPeriodEnd?.getTime() ?? 0) > periodEnd.getTime()
    )
    const again = await raiseRenewalBill(org.id)
    check(
      'asking for the bill again gives the one for the new period',
      again?.dueAt.getTime() === sub.currentPeriodEnd?.getTime()
    )

    console.log('\nCancelling')
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.now() - HOUR),
      },
    })
    await runBillingCycle()
    sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    })
    check('ended at period end: EXPIRED', sub.status === 'EXPIRED')
    const ended = await getEntitlements(org.id)
    check(
      'workspace locked (ENDED)',
      ended.access.state === 'RESTRICTED' && ended.access.reason === 'ENDED'
    )
    check(
      'trial still unavailable (already used)',
      !(await trialEligibility(org.id, user.id)).eligible
    )
  } finally {
    await prisma.billingPayment.deleteMany({
      where: { invoice: { organizationId: org.id } },
    })
    await prisma.billingInvoice.deleteMany({ where: { organizationId: org.id } })
    await prisma.planOrder.deleteMany({ where: { organizationId: org.id } })
    await prisma.organization.delete({ where: { id: org.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
}

pureChecks()
await lifecycleChecks()
await prisma.$disconnect()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
