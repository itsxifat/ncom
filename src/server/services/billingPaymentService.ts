import 'server-only'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { formatMoney } from '@/lib/money'
import { requireHumanOrgAccess } from '@/server/auth/rbac'
import {
  createCheckout,
  EnfinitoPayError,
  retrieveCheckout,
  toCents,
  type EnfinitoCheckout,
} from '@/server/billing/enfinitoPay'
import { getEnfinitoPayCredentials } from './enfinitoPaySettingsService'
import {
  activateOrder,
  CheckoutError,
  type QuoteLine,
} from './planCheckoutService'
import { CreditError, settleCreditOrderPayment } from './aiCreditService'
import { logAudit } from './auditService'
import { sendEmail } from './emailService'
import { planActivatedEmail } from '@/server/email/templates'

/**
 * Paying NCOM: a plan order or an AI credit order, through Enfinito Pay.
 *
 * Two halves, kept apart on purpose:
 *
 *   `startPayment` — the owner presses Pay. A checkout is made on Enfinito Pay
 *   for exactly what the order says, and the owner is sent to it. Nothing is
 *   granted.
 *
 *   `confirmPayment` — something says a checkout finished: the owner landing
 *   back on the success URL, or Enfinito Pay's signed webhook. Neither is
 *   believed. The checkout is fetched from Enfinito Pay, and only a `paid`
 *   checkout for the order's exact amount, in taka, in the mode the key is
 *   for, switches the plan on (`activateOrder`) or adds the credits
 *   (`settleCreditOrderPayment`). Both of those do it once, however many
 *   times a payment is confirmed.
 *
 * A merchant's shoppers never come through here — see paymentService for a
 * store's own payment methods.
 */

const PROVIDER = 'enfinito-pay'

export type BillingOrderKind = 'plan' | 'credits'

export class BillingPaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingPaymentError'
  }
}

interface PayableOrder {
  kind: BillingOrderKind
  id: string
  organizationId: string
  status: string
  currencyCode: string
  totalCents: number
  discountCents: number
  provider: string | null
  providerReference: string | null
  createdById: string | null
  items: { name: string; amountCents: number; quantity: number }[]
  description: string
}

/** What the payer sees as our order number, and what a paid checkout must carry back. */
function referenceFor(kind: BillingOrderKind, id: string): string {
  return `NCOM-${kind === 'plan' ? 'PLAN' : 'AI'}-${id}`
}

async function loadOrder(
  kind: BillingOrderKind,
  id: string
): Promise<PayableOrder | null> {
  if (kind === 'plan') {
    const order = await prisma.planOrder.findUnique({
      where: { id },
      include: { plan: { select: { name: true } } },
    })
    if (!order) return null
    const lines = Array.isArray(order.lineItems)
      ? (order.lineItems as unknown as QuoteLine[])
      : []
    let items = lines.map((line) => ({
      name: line.label,
      amountCents: line.unitPriceCents,
      quantity: line.quantity,
    }))
    // The lines are a snapshot of the quote and add up to its subtotal; if
    // they somehow do not, one line for the whole subtotal keeps the total
    // the payer sees the total the order is for.
    const sum = items.reduce(
      (total, item) => total + item.amountCents * item.quantity,
      0
    )
    if (items.length === 0 || sum !== order.subtotalCents) {
      items = [
        {
          name: order.plan.name,
          amountCents: order.subtotalCents,
          quantity: 1,
        },
      ]
    }
    return {
      kind,
      id: order.id,
      organizationId: order.organizationId,
      status: order.status,
      currencyCode: order.currencyCode,
      totalCents: order.totalCents,
      discountCents: order.discountCents,
      provider: order.provider,
      providerReference: order.providerReference,
      createdById: order.createdById,
      items,
      description: `${order.plan.name} · ${order.interval === 'ANNUAL' ? 'yearly' : 'monthly'}`,
    }
  }
  const order = await prisma.aiCreditOrder.findUnique({ where: { id } })
  if (!order) return null
  return {
    kind,
    id: order.id,
    organizationId: order.organizationId,
    status: order.status,
    currencyCode: order.currencyCode,
    totalCents: order.totalCents,
    discountCents: 0,
    provider: order.provider,
    providerReference: order.providerReference,
    createdById: order.createdById,
    items: [
      {
        name: `${order.packName} · ${order.credits.toLocaleString('en')} AI credits`,
        amountCents: order.totalCents,
        quantity: 1,
      },
    ],
    description: 'AI builder credits',
  }
}

function appUrl(path: string): string {
  return `${env.AUTH_URL.replace(/\/$/, '')}${path}`
}

/** Taka, to the paisa, the same way at both ends. */
function sameAmount(checkout: EnfinitoCheckout, cents: number): boolean {
  return toCents(checkout.amount_total) === cents
}

/** A checkout the owner can still finish, worth sending them back to. */
function stillPayable(checkout: EnfinitoCheckout): boolean {
  if (!['open', 'processing', 'failed'].includes(checkout.status)) return false
  // A couple of minutes' margin: a checkout about to expire would expire on
  // the owner while they choose bKash or Nagad.
  return new Date(checkout.expires_at).getTime() > Date.now() + 2 * 60_000
}

/**
 * Sends the owner to pay an order that is waiting for payment. Answers the
 * address to send them to: a checkout on Enfinito Pay, or — when the order
 * turns out to be paid already — the billing page.
 */
export async function startPayment(
  organizationId: string,
  kind: BillingOrderKind,
  orderId: string
): Promise<{ url: string }> {
  const { session } = await requireHumanOrgAccess(organizationId, 'OWNER')
  const credentials = await getEnfinitoPayCredentials()
  if (!credentials) {
    throw new BillingPaymentError(
      'Online payment isn’t open yet. Our team will contact you to finish this order.'
    )
  }
  const order = await loadOrder(kind, orderId)
  if (!order || order.organizationId !== organizationId) {
    throw new BillingPaymentError('That order was not found.')
  }
  if (order.status !== 'AWAITING_PAYMENT') {
    throw new BillingPaymentError(
      order.status === 'CANCELED' || order.status === 'FAILED'
        ? 'That order was cancelled. Start a new one.'
        : 'That order is already paid.'
    )
  }
  if (order.currencyCode !== 'BDT') {
    throw new BillingPaymentError(
      'Online payment takes taka (BDT) only. Our team will contact you to finish this order.'
    )
  }
  if (order.totalCents <= 0) {
    throw new BillingPaymentError('There is nothing to pay on that order.')
  }

  // A checkout already made for this order is the one to go back to while it
  // can still be paid: a second would let the owner pay twice. One that was
  // paid without us hearing of it is confirmed now instead.
  const previous =
    order.provider === PROVIDER && order.providerReference?.startsWith('cs_')
      ? order.providerReference
      : null
  if (previous) {
    try {
      const existing = await retrieveCheckout(credentials.secretKey, previous)
      if (existing.status === 'paid' || existing.status === 'refunded') {
        await confirmPayment(existing.id)
        return { url: paidUrl(kind) }
      }
      if (stillPayable(existing) && sameAmount(existing, order.totalCents)) {
        return { url: existing.url }
      }
    } catch (cause) {
      // Gone, or made with a key since replaced: a new one is made below.
      if (!(cause instanceof EnfinitoPayError) || cause.status >= 500)
        throw unavailable(cause)
    }
  }

  let checkout: EnfinitoCheckout
  try {
    checkout = await createCheckout(
      credentials.secretKey,
      {
        reference: referenceFor(kind, order.id),
        items: order.items,
        discountCents: order.discountCents,
        description: order.description,
        customer: {
          ...(session.user.name && { name: session.user.name }),
          ...(session.user.email && { email: session.user.email }),
        },
        // Placed by hand rather than left to be appended, so the billing
        // page's own query survives.
        successUrl: appUrl('/billing/payment/return?session_id={SESSION_ID}'),
        cancelUrl: appUrl('/billing?payment=cancelled&session_id={SESSION_ID}'),
        metadata: {
          ncom_order_kind: kind,
          ncom_order_id: order.id,
          ncom_organization_id: organizationId,
        },
      },
      // Retrying the same press returns the same checkout; after the previous
      // one expired or was cancelled, a new one.
      `${kind}:${order.id}:${previous ?? 'first'}`
    )
  } catch (cause) {
    throw unavailable(cause)
  }
  if (!sameAmount(checkout, order.totalCents) || checkout.currency !== 'BDT') {
    console.error('[billing] Enfinito Pay priced a checkout differently', {
      orderId: order.id,
      expected: order.totalCents,
      checkout: checkout.amount_total,
    })
    throw new BillingPaymentError(
      'The payment page showed a different total. Nothing was charged — try again.'
    )
  }

  await (kind === 'plan'
    ? prisma.planOrder.updateMany({
        where: { id: order.id, status: 'AWAITING_PAYMENT' },
        data: { provider: PROVIDER, providerReference: checkout.id },
      })
    : prisma.aiCreditOrder.updateMany({
        where: { id: order.id, status: 'AWAITING_PAYMENT' },
        data: { provider: PROVIDER, providerReference: checkout.id },
      }))
  await logAudit(
    session.user.id,
    'billing.payment.started',
    kind === 'plan' ? 'PlanOrder' : 'AiCreditOrder',
    order.id,
    { checkoutId: checkout.id, livemode: checkout.livemode }
  )
  return { url: checkout.url }
}

/** Where the owner lands once an order is paid: the billing page, saying so. */
export function paidUrl(kind: BillingOrderKind): string {
  return kind === 'plan' ? '/billing?activated=1' : '/billing?credits=added'
}

function unavailable(cause: unknown): BillingPaymentError {
  console.error('[billing] Enfinito Pay request failed', cause)
  return new BillingPaymentError(
    cause instanceof EnfinitoPayError && cause.code === 'site_paused'
      ? 'Online payment is paused right now. Try again later.'
      : 'The payment page could not be opened. Try again in a minute.'
  )
}

export type PaymentOutcome =
  | { outcome: 'paid'; kind: BillingOrderKind; organizationId: string }
  | {
      outcome: 'waiting' | 'failed' | 'closed' | 'refunded'
      kind: BillingOrderKind
      organizationId: string
    }
  /** No order of ours, a checkout that does not match its order, or one that could not be applied. */
  | { outcome: 'ignored' }

/**
 * What a checkout's result means for its order, applied. Safe to call any
 * number of times for one checkout; see the file header for what is checked.
 */
export async function confirmPayment(
  checkoutId: string
): Promise<PaymentOutcome> {
  const credentials = await getEnfinitoPayCredentials()
  if (!credentials) return { outcome: 'ignored' }
  const checkout = await retrieveCheckout(credentials.secretKey, checkoutId)

  const order = await findOrderFor(checkout)
  if (!order) {
    console.warn('[billing] a checkout for no order of ours', checkout.id)
    return { outcome: 'ignored' }
  }
  const entity = order.kind === 'plan' ? 'PlanOrder' : 'AiCreditOrder'
  const base = { kind: order.kind, organizationId: order.organizationId }

  // A test payment must never switch on a real plan, nor a live one land
  // on a test setup.
  if (checkout.livemode !== (credentials.mode === 'live')) {
    console.error('[billing] a checkout in the other mode', checkout.id)
    return { outcome: 'ignored' }
  }

  if (checkout.status === 'paid') {
    if (
      checkout.currency !== 'BDT' ||
      !sameAmount(checkout, order.totalCents) ||
      checkout.reference !== referenceFor(order.kind, order.id)
    ) {
      console.error('[billing] a paid checkout does not match its order', {
        checkout: checkout.id,
        order: order.id,
      })
      await logAudit(null, 'billing.payment.mismatch', entity, order.id, {
        checkoutId: checkout.id,
        amount: checkout.amount_total,
        currency: checkout.currency,
      })
      return { outcome: 'ignored' }
    }
    const reference = checkout.payment?.transaction_id ?? checkout.id
    try {
      const applied =
        order.kind === 'plan'
          ? await activateOrder(order.id, {
              actorUserId: order.createdById,
              provider: PROVIDER,
              providerReference: reference,
              markPaid: true,
            })
          : await settleCreditOrderPayment(order.id, {
              actorUserId: order.createdById,
              provider: PROVIDER,
              providerReference: reference,
            })
      if (applied) {
        await logAudit(
          order.createdById,
          'billing.payment.succeeded',
          entity,
          order.id,
          {
            checkoutId: checkout.id,
            transactionId: checkout.payment?.transaction_id ?? null,
            method: checkout.payment?.method ?? null,
            livemode: checkout.livemode,
          }
        )
        if (order.kind === 'plan') await mailActivation(order)
      }
    } catch (cause) {
      // Paid for an order that was closed meanwhile — cancelled by the team,
      // say. The money is taken and nothing was granted, so a person must
      // look at it: refund it or activate it by hand.
      if (cause instanceof CheckoutError || cause instanceof CreditError) {
        console.error('[billing] a payment for a closed order', {
          checkout: checkout.id,
          order: order.id,
        })
        await logAudit(null, 'billing.payment.unapplied', entity, order.id, {
          checkoutId: checkout.id,
          transactionId: checkout.payment?.transaction_id ?? null,
          reason: cause.message,
        })
        return { outcome: 'ignored' }
      }
      throw cause
    }
    return { outcome: 'paid', ...base }
  }

  if (checkout.status === 'refunded') {
    // Access is not taken away by itself: the team decides, as it does for
    // anything that would take a paying workspace offline.
    await logAudit(null, 'billing.payment.refunded', entity, order.id, {
      checkoutId: checkout.id,
      transactionId: checkout.payment?.transaction_id ?? null,
    })
    return { outcome: 'refunded', ...base }
  }
  if (checkout.status === 'failed') return { outcome: 'failed', ...base }
  if (checkout.status === 'cancelled' || checkout.status === 'expired')
    return { outcome: 'closed', ...base }
  return { outcome: 'waiting', ...base }
}

/** The order a checkout is for: by what we put in its metadata, else by the checkout id we stored. */
async function findOrderFor(
  checkout: EnfinitoCheckout
): Promise<PayableOrder | null> {
  const kind = checkout.metadata?.ncom_order_kind
  const id = checkout.metadata?.ncom_order_id
  if ((kind === 'plan' || kind === 'credits') && id) {
    return loadOrder(kind, id)
  }
  const plan = await prisma.planOrder.findFirst({
    where: { provider: PROVIDER, providerReference: checkout.id },
    select: { id: true },
  })
  if (plan) return loadOrder('plan', plan.id)
  const credits = await prisma.aiCreditOrder.findFirst({
    where: { provider: PROVIDER, providerReference: checkout.id },
    select: { id: true },
  })
  return credits ? loadOrder('credits', credits.id) : null
}

/**
 * The "your plan is on" email, to whoever placed the order. Best effort: the
 * plan is already live, and a mail failure must not make the webhook retry.
 */
async function mailActivation(order: PayableOrder) {
  try {
    const [user, organization, planOrder] = await Promise.all([
      order.createdById
        ? prisma.user.findUnique({
            where: { id: order.createdById },
            select: { email: true },
          })
        : null,
      prisma.organization.findUnique({
        where: { id: order.organizationId },
        select: { name: true },
      }),
      prisma.planOrder.findUnique({
        where: { id: order.id },
        select: { couponCode: true, plan: { select: { name: true } } },
      }),
    ])
    if (!user?.email || !organization || !planOrder) return
    const rendered = planActivatedEmail({
      workspaceName: organization.name,
      planName: planOrder.plan.name,
      totalLabel: formatMoney(order.totalCents, order.currencyCode),
      couponCode: planOrder.couponCode,
    })
    await sendEmail({
      purpose: 'BILLING',
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
  } catch (cause) {
    console.error('[billing] the plan activation email failed', cause)
  }
}
