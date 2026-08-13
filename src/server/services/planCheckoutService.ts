import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type {
  PlanOrderStatus,
  SubscriptionInterval,
} from '@/generated/prisma/enums'
import { requireOrgAccess, requireHumanOrgAccess } from '@/server/auth/rbac'
import { logAudit } from '@/server/services/auditService'
import {
  evaluateCoupon,
  redeemCoupon,
  type CouponEvaluation,
  type CouponRejection,
} from '@/server/services/planCouponService'
import { ensureSubscription } from '@/server/services/entitlementService'

/**
 * Subscribing to a plan, and changing one.
 *
 * There is no payment gateway yet, and which one NCOM will use is undecided.
 * The flow is still a real checkout — quote, coupon, order record, activation —
 * because the part that is missing is exactly one step in the middle. What is
 * built here:
 *
 *   total === 0  ->  the order is AUTO_ACTIVATED and access is granted in the
 *                    same transaction. This is every tenant today: they are
 *                    onboarded with a 100%-off code, so checkout genuinely
 *                    costs nothing and asking for a card would be theatre.
 *
 *   total  >  0  ->  the order is AWAITING_PAYMENT and access is NOT granted.
 *                    The subscription keeps whatever plan it already had. A
 *                    platform admin can activate the order by hand (a bank
 *                    transfer, an invoice), which is the same call a gateway
 *                    webhook will make once there is one.
 *
 * The important property is that entitlements are never granted by the checkout
 * page — only by `activateOrder`. When a gateway is added it calls that one
 * function and nothing else about this file needs to change.
 */

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutError'
  }
}

// ── Quoting ───────────────────────────────────────────────────────────────

export interface QuoteLine {
  kind: 'PLAN' | 'ADDON'
  refId: string
  label: string
  quantity: number
  unitPriceCents: number
  amountCents: number
}

export interface CheckoutQuote {
  planId: string
  planName: string
  planCode: string
  interval: SubscriptionInterval
  currencyCode: string
  lines: QuoteLine[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  /** True when nothing is owed, so checkout can complete without a gateway. */
  isFree: boolean
  coupon: CouponEvaluation | null
  couponError: { reason: CouponRejection; message: string } | null
  trialDays: number
  isContactSalesOnly: boolean
}

export interface QuoteInput {
  organizationId: string
  planId: string
  interval: SubscriptionInterval
  addons?: { addonId: string; quantity: number }[]
  couponCode?: string | null
}

function priceFor(
  plan: { monthlyPriceCents: number; annualPriceCents: number | null },
  interval: SubscriptionInterval
): number {
  if (interval === 'ANNUAL') {
    if (plan.annualPriceCents === null) {
      throw new CheckoutError('This plan is not offered annually.')
    }
    return plan.annualPriceCents
  }
  return plan.monthlyPriceCents
}

function addonPriceFor(
  addon: { monthlyPriceCents: number; annualPriceCents: number | null },
  interval: SubscriptionInterval
): number {
  if (interval === 'ANNUAL') {
    // An add-on with no annual price is billed at twelve monthly charges rather
    // than being refused: blocking the whole annual checkout because one add-on
    // lacks a yearly price would be a worse answer than charging the honest
    // twelve-month equivalent.
    return addon.annualPriceCents ?? addon.monthlyPriceCents * 12
  }
  return addon.monthlyPriceCents
}

/**
 * Prices a prospective subscription. Read-only — safe to call on every keystroke
 * in the coupon field.
 */
export async function quoteCheckout(input: QuoteInput): Promise<CheckoutQuote> {
  const { session } = await requireHumanOrgAccess(input.organizationId, 'OWNER')

  const plan = await prisma.plan.findFirst({
    where: { id: input.planId, isActive: true },
  })
  if (!plan) throw new CheckoutError('That plan is not available.')

  const requestedAddons = (input.addons ?? []).filter((a) => a.quantity > 0)
  const addonRows = requestedAddons.length
    ? await prisma.addon.findMany({
        where: {
          id: { in: requestedAddons.map((a) => a.addonId) },
          isActive: true,
        },
        include: { plans: true },
      })
    : []

  const lines: QuoteLine[] = []

  const planPrice = priceFor(plan, input.interval)
  lines.push({
    kind: 'PLAN',
    refId: plan.id,
    label: `${plan.name} (${input.interval === 'ANNUAL' ? 'annual' : 'monthly'})`,
    quantity: 1,
    unitPriceCents: planPrice,
    amountCents: planPrice,
  })

  let addonSubtotal = 0
  for (const requested of requestedAddons) {
    const addon = addonRows.find((row) => row.id === requested.addonId)
    if (!addon) throw new CheckoutError('One of those add-ons is unavailable.')

    if (
      !addon.availableOnAllPlans &&
      !addon.plans.some((row) => row.planId === plan.id)
    ) {
      throw new CheckoutError(`${addon.name} is not available on ${plan.name}.`)
    }

    const quantity =
      addon.maxQuantity === null
        ? requested.quantity
        : Math.min(requested.quantity, addon.maxQuantity)

    const unit = addonPriceFor(addon, input.interval)
    const amount = unit * quantity
    addonSubtotal += amount

    lines.push({
      kind: 'ADDON',
      refId: addon.id,
      label: addon.name,
      quantity,
      unitPriceCents: unit,
      amountCents: amount,
    })
  }

  const subtotalCents = planPrice + addonSubtotal

  let coupon: CouponEvaluation | null = null
  let couponError: CheckoutQuote['couponError'] = null

  if (input.couponCode?.trim()) {
    const result = await evaluateCoupon(input.couponCode, {
      organizationId: input.organizationId,
      planId: plan.id,
      interval: input.interval,
      planSubtotalCents: planPrice,
      addonSubtotalCents: addonSubtotal,
      currencyCode: plan.currencyCode,
      userEmail: session.user.email,
      userEmailVerified: await isEmailVerified(session.user.id),
    })

    if (result.ok) {
      coupon = result.evaluation
    } else {
      couponError = { reason: result.reason, message: result.message }
    }
  }

  const discountCents = Math.min(subtotalCents, coupon?.discountCents ?? 0)
  const totalCents = subtotalCents - discountCents

  return {
    planId: plan.id,
    planName: plan.name,
    planCode: plan.code,
    interval: input.interval,
    currencyCode: plan.currencyCode,
    lines,
    subtotalCents,
    discountCents,
    totalCents,
    isFree: totalCents === 0,
    coupon,
    couponError,
    trialDays: plan.trialDays + (coupon?.trialDays ?? 0),
    isContactSalesOnly: plan.isContactSalesOnly,
  }
}

async function isEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  })
  return user?.emailVerified !== null && user?.emailVerified !== undefined
}

// ── Checkout ──────────────────────────────────────────────────────────────

export interface CheckoutResult {
  orderId: string
  status: PlanOrderStatus
  /** True when the plan is live now; false means the order is awaiting payment. */
  activated: boolean
  totalCents: number
  currencyCode: string
}

export async function startCheckout(
  input: QuoteInput
): Promise<CheckoutResult> {
  const { session } = await requireHumanOrgAccess(input.organizationId, 'OWNER')

  const quote = await quoteCheckout(input)

  if (quote.isContactSalesOnly) {
    throw new CheckoutError(
      'This plan is arranged with our sales team — get in touch and we will set it up for you.'
    )
  }
  // A code the tenant typed that did not apply must stop the checkout. Silently
  // charging full price because the coupon was rejected is the single worst
  // outcome available here.
  if (quote.couponError) {
    throw new CheckoutError(quote.couponError.message)
  }

  const subscription = await ensureSubscription(input.organizationId)

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.planOrder.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: subscription?.id ?? null,
        planId: quote.planId,
        interval: quote.interval,
        currencyCode: quote.currencyCode,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        totalCents: quote.totalCents,
        couponId: quote.coupon?.couponId ?? null,
        couponCode: quote.coupon?.code ?? null,
        status: quote.isFree ? 'AUTO_ACTIVATED' : 'AWAITING_PAYMENT',
        lineItems: quote.lines as unknown as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
    })

    if (quote.coupon) {
      const redeemed = await redeemCoupon(tx, {
        couponId: quote.coupon.couponId,
        organizationId: input.organizationId,
        subscriptionId: subscription?.id ?? null,
        planOrderId: created.id,
        discountCents: quote.discountCents,
      })
      // Lost the race for the last redemption. Rolling back is the only honest
      // option: the tenant agreed to a discounted total that is no longer
      // available, and quietly charging them the full amount is not a fix.
      if (!redeemed) {
        throw new CheckoutError(
          'That code was fully redeemed a moment ago. Try again without it.'
        )
      }
    }

    if (quote.isFree) {
      await applyActivation(tx, {
        organizationId: input.organizationId,
        order: created,
        addons: input.addons ?? [],
        couponPeriodsRemaining: quote.coupon?.periodsRemaining ?? null,
        trialDays: quote.trialDays,
      })
    }

    return created
  })

  await logAudit(
    session.user.id,
    quote.isFree ? 'plan.checkout.activated' : 'plan.checkout.pending',
    'PlanOrder',
    order.id,
    {
      planId: quote.planId,
      interval: quote.interval,
      totalCents: quote.totalCents,
      couponCode: quote.coupon?.code ?? null,
    }
  )

  return {
    orderId: order.id,
    status: order.status,
    activated: quote.isFree,
    totalCents: quote.totalCents,
    currencyCode: quote.currencyCode,
  }
}

function periodEnd(from: Date, interval: SubscriptionInterval): Date {
  const end = new Date(from)
  // setUTCMonth handles the year rollover and clamps end-of-month itself, so
  // 31 Jan + 1 month lands in early March rather than throwing — the same
  // behaviour every billing system settles on for monthly anniversaries.
  end.setUTCMonth(end.getUTCMonth() + (interval === 'ANNUAL' ? 12 : 1))
  return end
}

/**
 * Moves the subscription onto the ordered plan. The only path that grants
 * entitlements — see the file header.
 */
async function applyActivation(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string
    order: {
      id: string
      planId: string
      interval: SubscriptionInterval
      currencyCode: string
      subtotalCents: number
      discountCents: number
    }
    addons: { addonId: string; quantity: number }[]
    couponPeriodsRemaining: number | null
    trialDays: number
  }
): Promise<void> {
  const now = new Date()
  const { order } = input

  const trialEndsAt =
    input.trialDays > 0
      ? new Date(now.getTime() + input.trialDays * 24 * 60 * 60 * 1000)
      : null

  const subscription = await tx.subscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      planId: order.planId,
      interval: order.interval,
      status: trialEndsAt ? 'TRIALING' : 'ACTIVE',
      currencyCode: order.currencyCode,
      unitPriceCents: order.subtotalCents,
      discountCents: order.discountCents,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd(now, order.interval),
      trialEndsAt,
      couponPeriodsRemaining: input.couponPeriodsRemaining,
    },
    update: {
      planId: order.planId,
      interval: order.interval,
      status: trialEndsAt ? 'TRIALING' : 'ACTIVE',
      currencyCode: order.currencyCode,
      unitPriceCents: order.subtotalCents,
      discountCents: order.discountCents,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd(now, order.interval),
      trialEndsAt,
      couponPeriodsRemaining: input.couponPeriodsRemaining,
      // A plan change re-opens a cancelled subscription: the tenant just paid
      // (or redeemed) for a new period, so a pending cancellation is stale.
      cancelAtPeriodEnd: false,
      canceledAt: null,
      endedAt: null,
    },
  })

  // Add-on lines are replaced wholesale rather than merged. The checkout screen
  // submits the complete set the tenant wants, so a merge would make it
  // impossible to ever remove one.
  await tx.subscriptionAddon.deleteMany({
    where: { subscriptionId: subscription.id },
  })

  const wanted = input.addons.filter((a) => a.quantity > 0)
  if (wanted.length > 0) {
    const addonRows = await tx.addon.findMany({
      where: { id: { in: wanted.map((a) => a.addonId) }, isActive: true },
    })

    await tx.subscriptionAddon.createMany({
      data: wanted.flatMap((line) => {
        const addon = addonRows.find((row) => row.id === line.addonId)
        if (!addon) return []
        const quantity =
          addon.maxQuantity === null
            ? line.quantity
            : Math.min(line.quantity, addon.maxQuantity)
        return [
          {
            subscriptionId: subscription.id,
            addonId: addon.id,
            quantity,
            unitPriceCents:
              order.interval === 'ANNUAL'
                ? (addon.annualPriceCents ?? addon.monthlyPriceCents * 12)
                : addon.monthlyPriceCents,
          },
        ]
      }),
    })
  }

  await tx.planOrder.update({
    where: { id: order.id },
    data: { subscriptionId: subscription.id, activatedAt: now },
  })

  await tx.planCouponRedemption.updateMany({
    where: { planOrderId: order.id },
    data: { subscriptionId: subscription.id },
  })
}

/**
 * Grants access for an order that was awaiting payment.
 *
 * The seam a payment gateway will call from its webhook. Until then it is the
 * platform admin's "mark as paid" button, which is why it takes the money
 * details as arguments rather than inventing them.
 *
 * Authorization is the caller's job — a webhook has no session to check, so
 * this function cannot do it itself. The admin action calls
 * `requirePlatformAdmin()` first and passes the resulting user as `actorUserId`.
 */
export async function activateOrder(
  orderId: string,
  input: {
    actorUserId: string
    provider?: string
    providerReference?: string
    markPaid?: boolean
  }
): Promise<void> {
  const order = await prisma.planOrder.findUnique({
    where: { id: orderId },
    include: { subscription: { include: { addons: true } } },
  })
  if (!order) throw new CheckoutError('Order not found.')
  if (order.status === 'ACTIVATED' || order.status === 'AUTO_ACTIVATED') return
  if (order.status === 'CANCELED' || order.status === 'FAILED') {
    throw new CheckoutError('That order is closed and cannot be activated.')
  }

  const lines = Array.isArray(order.lineItems)
    ? (order.lineItems as unknown as QuoteLine[])
    : []
  const addons = lines
    .filter((line) => line.kind === 'ADDON')
    .map((line) => ({ addonId: line.refId, quantity: line.quantity }))

  await prisma.$transaction(async (tx) => {
    await applyActivation(tx, {
      organizationId: order.organizationId,
      order,
      addons,
      // A coupon's remaining periods were computed at checkout; re-deriving
      // them here would need the coupon's rules again, so the subscription
      // keeps whatever the order recorded.
      couponPeriodsRemaining:
        order.subscription?.couponPeriodsRemaining ?? null,
      trialDays: 0,
    })

    await tx.planOrder.update({
      where: { id: order.id },
      data: {
        status: 'ACTIVATED',
        paidAt: input.markPaid ? new Date() : order.paidAt,
        provider: input.provider ?? order.provider,
        providerReference: input.providerReference ?? order.providerReference,
      },
    })
  })

  await logAudit(
    input.actorUserId,
    'plan.order.activated',
    'PlanOrder',
    order.id,
    {
      provider: input.provider ?? null,
    }
  )
}

export async function cancelOrder(
  orderId: string,
  input: { actorUserId: string; reason?: string }
): Promise<void> {
  await prisma.planOrder.update({
    where: { id: orderId },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
      failureReason: input.reason ?? null,
    },
  })

  await logAudit(
    input.actorUserId,
    'plan.order.canceled',
    'PlanOrder',
    orderId,
    {
      reason: input.reason ?? null,
    }
  )
}

// ── Subscription lifecycle ────────────────────────────────────────────────

/**
 * Schedules or performs a cancellation.
 *
 * At period end by default: the tenant paid through that date and pulling their
 * sites offline early would be taking something they already bought. Immediate
 * cancellation drops them onto the default plan, so their sites keep serving
 * within free limits rather than going dark.
 */
export async function cancelSubscription(
  organizationId: string,
  options: { immediate?: boolean } = {}
): Promise<void> {
  const { session } = await requireHumanOrgAccess(organizationId, 'OWNER')

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  })
  if (!subscription) throw new CheckoutError('No active subscription.')

  if (!options.immediate) {
    await prisma.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    })
  } else {
    const defaultPlan = await prisma.plan.findFirst({
      where: { isDefault: true, isActive: true },
    })
    if (!defaultPlan) throw new CheckoutError('No default plan configured.')

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionAddon.deleteMany({
        where: { subscriptionId: subscription.id },
      })
      await tx.subscription.update({
        where: { organizationId },
        data: {
          planId: defaultPlan.id,
          status: 'ACTIVE',
          interval: 'MONTHLY',
          unitPriceCents: defaultPlan.monthlyPriceCents,
          discountCents: 0,
          couponId: null,
          couponPeriodsRemaining: null,
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
        },
      })
    })
  }

  await logAudit(
    session.user.id,
    options.immediate
      ? 'plan.subscription.canceled_now'
      : 'plan.subscription.cancel_scheduled',
    'Subscription',
    subscription.id
  )
}

/** Undoes a scheduled cancellation while the period is still running. */
export async function resumeSubscription(
  organizationId: string
): Promise<void> {
  await requireOrgAccess(organizationId, 'OWNER')
  await prisma.subscription.update({
    where: { organizationId },
    data: { cancelAtPeriodEnd: false, canceledAt: null },
  })
}

// ── Reads for the billing UI ──────────────────────────────────────────────

export async function listSelectablePlans() {
  return prisma.plan.findMany({
    where: { isActive: true, isPublic: true },
    orderBy: { position: 'asc' },
  })
}

export async function listSelectableAddons(planId: string) {
  return prisma.addon.findMany({
    where: {
      isActive: true,
      OR: [{ availableOnAllPlans: true }, { plans: { some: { planId } } }],
    },
    orderBy: { position: 'asc' },
  })
}

export async function listPlanOrders(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')
  return prisma.planOrder.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { plan: { select: { name: true } } },
  })
}
