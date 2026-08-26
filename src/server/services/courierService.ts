import 'server-only'
import { after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess, requireHumanOrgAccess } from '@/server/auth/rbac'
import { emitWebhook } from './webhookService'
import { sendEmail } from './emailService'
import { orderDispatchedEmail } from '@/server/email/templates'
import {
  cancelOrder,
  emitOrderWebhook,
  markOrderPaid,
  orderLineImageUrl,
  ORDER_LINE_IMAGE_SELECT,
} from './orderService'
import {
  consumeCommittedStock,
  resolveStoreLocationId,
} from './inventoryService'
import {
  courierClientFor,
  defaultCourierProvider,
} from './courierConfigService'
import { getCourierSettings, screenPhone } from './fraudCheckService'
import {
  isManualWorkflowState,
  isTerminal,
  shipmentStatusFor,
  workflowStateFor,
  WORKFLOW_STATE_LABEL,
} from '@/server/courier/statusMap'
import { normalizeBdPhone } from '@/server/courier/phone'
import { isOrderCancelled, orderStatus } from '@/lib/order-status'
import { requireCourierInvoice } from '@/server/courier/invoice'
import {
  CourierApiError,
  CourierNotConfiguredError,
  type CourierConsignmentRequest,
  type CourierStatusResult,
} from '@/server/courier/types'
import type {
  CourierEventSource,
  CourierProvider,
  CourierShipmentStatus,
  FraudVerdict,
  OrderWorkflowState,
} from '@/generated/prisma/enums'

/**
 * The courier pipeline.
 *
 * An order arrives, is screened against the customer's delivery history, and
 * then either goes to a courier without anyone touching it or waits in a queue
 * for a human. Once a consignment exists, the courier's own webhooks drive
 * every state after that, with a reconciliation poll behind them.
 *
 * Three invariants hold everything together:
 *
 *   Only PROCESSING dispatches. An order reaches PROCESSING by passing the
 *   screen or by a named human approving it, and nothing else auto-dispatches.
 *   That is what makes it safe for legacy orders — and any order the screen
 *   could not evaluate — to sit at PENDING indefinitely.
 *
 *   Dispatch is idempotent per order. The shipment row is created before the
 *   courier is called and carries the order's unique number as the merchant
 *   reference, so a retried dispatch reuses the row rather than creating a
 *   second parcel. Double-shipping a cash-on-delivery order costs the merchant
 *   twice and confuses the customer once.
 *
 *   Inbound events never move a parcel backwards. Couriers retry webhooks and
 *   deliver them out of order; a delivered parcel that receives a late
 *   "in transit" retry must stay delivered.
 */

/** Attempts at reaching a courier before a dispatch is left for a human. */
const MAX_DISPATCH_ATTEMPTS = 5

/** Backoff between dispatch attempts, in seconds: 30s, 2m, 10m, 1h. */
const DISPATCH_BACKOFF_SECONDS = [30, 120, 600, 3600]

/**
 * How long a parcel may go silent before the sweep polls the courier about it.
 *
 * Webhooks are the primary channel and are usually immediate; this is the
 * backstop for the ones that are dropped, and a dropped webhook is invisible by
 * definition — the only way to notice is to ask.
 */
const POLL_AFTER_QUIET_MINUTES = 90

// ── Screening and admission ──────────────────────────────────────────────

/**
 * Screens a newly placed order and decides what happens to it.
 *
 * Called after checkout commits, off the buyer's critical path. Never throws:
 * a screening failure leaves the order at PENDING with an explanation attached,
 * which a merchant can act on, rather than turning a completed sale into an
 * error the customer sees.
 */
export async function evaluateOrderForCourier(
  organizationId: string,
  orderId: string
): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      select: {
        id: true,
        orderNumber: true,
        phone: true,
        totalCents: true,
        financialStatus: true,
        workflowState: true,
        cancelledAt: true,
        shippingAddress: true,
      },
    })

    // Only a fresh order is screened. Anything already moved on — approved,
    // dispatched, cancelled — must not be dragged back through the gate by a
    // retried call.
    if (!order || order.workflowState !== 'PENDING' || isOrderCancelled(order))
      return

    // Nothing configured, nothing to do. This whole pipeline is opt-in, and a
    // workspace that has never opened courier settings must see no change at
    // all: no verdict on its orders, no timeline entries, and above all no
    // review queue. Without this check the screen returns "could not check"
    // for every order — there are no credentials to check with — and every
    // order of every existing merchant lands in FRAUD_REVIEW.
    const configuredCouriers = await prisma.courierConfig.count({
      where: { organizationId },
    })
    if (configuredCouriers === 0) return

    const settings = await getCourierSettings(organizationId)

    const assessment = await screenPhone(
      organizationId,
      order.phone ?? readAddressPhone(order.shippingAddress),
      settings
    )

    // Value-based review is a separate gate from the customer's history: a
    // spotless customer ordering far above the usual basket is exactly the
    // pattern a merchant wants to eyeball, and it is not visible in a delivery
    // rate.
    const overValueLimit =
      settings.manualReviewAboveCents != null &&
      order.totalCents > settings.manualReviewAboveCents

    const unpaidButPaidRequired =
      settings.requirePaidOrders && order.financialStatus !== 'PAID'

    let state: OrderWorkflowState
    let reason = assessment.reason

    if (assessment.verdict === 'FAIL' && settings.autoCancelOnFail) {
      state = 'CANCELLED'
    } else if (
      assessment.verdict === 'FAIL' ||
      assessment.verdict === 'REVIEW'
    ) {
      state = 'FRAUD_REVIEW'
    } else if (assessment.verdict === 'UNAVAILABLE') {
      // The customer is not at fault and the merchant should not lose the sale
      // to a third party's outage — but nothing auto-ships on no information.
      state = 'FRAUD_REVIEW'
      reason = `Could not screen this customer: ${assessment.reason}`
    } else if (overValueLimit) {
      state = 'FRAUD_REVIEW'
      reason = `${assessment.reason} Held because the order is above your manual-review value.`
    } else if (unpaidButPaidRequired) {
      state = 'FRAUD_REVIEW'
      reason = `${assessment.reason} Held because you only auto-dispatch paid orders.`
    } else if (settings.autoDispatchEnabled) {
      state = 'PROCESSING'
    } else {
      // Screened clean, but the merchant dispatches by hand. PENDING is the
      // honest state: cleared, waiting for a person.
      state = 'PENDING'
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          workflowState: state,
          workflowUpdatedAt: new Date(),
          fraudVerdict: assessment.verdict,
          fraudCheckedAt: assessment.checkedAt,
          fraudDelivered: assessment.delivered,
          fraudCancelled: assessment.cancelled,
          fraudReports: assessment.frauds,
          fraudSuccessRateBps: assessment.successRateBps,
          fraudReason: reason.slice(0, 500),
          ...(state === 'CANCELLED'
            ? { cancelledAt: new Date(), cancelReason: 'FRAUD' as const }
            : {}),
        },
      })

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'fraud_screened',
          message: reason,
          metadata: {
            verdict: assessment.verdict,
            delivered: assessment.delivered,
            cancelled: assessment.cancelled,
            frauds: assessment.frauds,
            successRateBps: assessment.successRateBps,
            cached: assessment.cached,
          },
        },
      })
    })

    if (state === 'FRAUD_REVIEW') {
      await emitOrderWebhook(organizationId, orderId, 'ORDER_HELD_FOR_REVIEW')
    }

    if (state === 'CANCELLED') {
      await emitOrderWebhook(organizationId, orderId, 'ORDER_CANCELLED')
      return
    }

    if (state === 'PROCESSING') {
      // A delay gives the customer a window to call and change or cancel before
      // a parcel is physically created — cheaper for everyone than chasing one.
      if (settings.dispatchDelayMinutes > 0) {
        await prisma.orderEvent.create({
          data: {
            orderId,
            type: 'dispatch_scheduled',
            message: `Queued for dispatch in ${settings.dispatchDelayMinutes} minutes`,
          },
        })
        return
      }

      await dispatchOrderInternal(organizationId, orderId, null)
    }
  } catch (cause) {
    // Screening is an enhancement to an order that already succeeded. It must
    // never be the reason a placed order breaks.
    console.error('[courier] screening failed for', orderId, cause)
  }
}

/** Queues screening to run after the response is flushed. */
export function scheduleCourierEvaluation(
  organizationId: string,
  orderId: string
): void {
  const run = () => evaluateOrderForCourier(organizationId, orderId)

  try {
    after(run)
  } catch {
    // Outside a request — seed scripts, cron — `after` throws rather than
    // quietly doing nothing.
    void run().catch((cause) => console.error('[courier] evaluation', cause))
  }
}

/**
 * Screens one order again on demand, with fresh numbers.
 *
 * Forced past the cache: the whole reason a merchant presses this is that the
 * stored verdict is from when the order arrived, and a customer's delivery
 * history moves as they order from other shops. The order's own state is left
 * alone — this updates what is *known*, it does not re-decide. Releasing a held
 * order stays an explicit human act with a name attached to it.
 */
export async function rescreenOrder(
  organizationId: string,
  orderId: string
): Promise<{ verdict: FraudVerdict; reason: string }> {
  await requireOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, phone: true, shippingAddress: true },
  })
  if (!order) throw new Error('Order not found')

  const settings = await getCourierSettings(organizationId)
  const assessment = await screenPhone(
    organizationId,
    order.phone ?? readAddressPhone(order.shippingAddress),
    settings,
    { force: true }
  )

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        fraudVerdict: assessment.verdict,
        fraudCheckedAt: assessment.checkedAt,
        fraudDelivered: assessment.delivered,
        fraudCancelled: assessment.cancelled,
        fraudReports: assessment.frauds,
        fraudSuccessRateBps: assessment.successRateBps,
        fraudReason: assessment.reason.slice(0, 500),
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId,
        type: 'fraud_screened',
        message: `Re-checked: ${assessment.reason}`,
        metadata: {
          verdict: assessment.verdict,
          delivered: assessment.delivered,
          cancelled: assessment.cancelled,
          frauds: assessment.frauds,
          successRateBps: assessment.successRateBps,
        },
      },
    }),
  ])

  return { verdict: assessment.verdict, reason: assessment.reason }
}

// ── Human decisions on held orders ───────────────────────────────────────

/**
 * A person releases a held order.
 *
 * Records who, because this is the decision that overrides an automated refusal
 * and the merchant will want to know whose judgement it was when a released
 * order comes back refused.
 */
export async function approveOrderForDispatch(
  organizationId: string,
  orderId: string,
  options: { provider?: CourierProvider | null; note?: string } = {}
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, workflowState: true, cancelledAt: true },
  })
  if (!order) throw new Error('Order not found')
  if (isOrderCancelled(order)) throw new Error('This order has been cancelled')
  if (
    order.workflowState !== 'FRAUD_REVIEW' &&
    order.workflowState !== 'PENDING'
  ) {
    throw new Error('This order has already moved past review')
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        workflowState: 'PROCESSING',
        workflowUpdatedAt: new Date(),
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'order_approved',
        message: options.note?.trim()
          ? `Approved for dispatch — ${options.note.trim()}`
          : 'Approved for dispatch',
        actorUserId: session.user.id,
      },
    })
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return dispatchOrderInternal(
    organizationId,
    orderId,
    options.provider ?? null
  )
}

/** A person refuses a held order. Cancels it and returns the stock. */
export async function rejectHeldOrder(
  organizationId: string,
  orderId: string,
  note?: string
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, workflowState: true, cancelledAt: true },
  })
  if (!order) throw new Error('Order not found')
  if (isOrderCancelled(order))
    throw new Error('This order is already cancelled')

  // Only who decided, and when. The status itself is `cancelOrder`'s to write
  // below — asserting CANCELLED here as well would make this function the
  // second writer of the same fact, and now that a cancelled order is
  // recognised by its state, it would walk into that call's own
  // already-cancelled guard.
  await prisma.order.update({
    where: { id: orderId },
    data: {
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
    },
  })

  await prisma.orderEvent.create({
    data: {
      orderId,
      type: 'order_rejected',
      message: note?.trim()
        ? `Rejected at review — ${note.trim()}`
        : 'Rejected at review',
      actorUserId: session.user.id,
    },
  })

  // Reuse the ordinary cancellation path so stock, statuses and the outbound
  // order.cancelled webhook all behave exactly as a manual cancel does. A
  // second way to cancel an order is a second way to get it wrong.
  return cancelOrder(organizationId, orderId, {
    reason: 'FRAUD',
    restock: true,
  })
}

// ── Dispatch ─────────────────────────────────────────────────────────────

/**
 * Merchant-triggered dispatch from the order page.
 *
 * The attempt budget is reset first. Automatic retries are rationed because
 * nobody is watching them and a courier having a bad hour should not be asked
 * five hundred times; a person pressing "Try again" is the opposite situation.
 * They are here because the last attempt failed, they have usually just fixed
 * the reason, and a spent counter would let them make exactly one more attempt
 * before the order became permanently unsendable from the UI.
 */
export async function dispatchOrder(
  organizationId: string,
  orderId: string,
  provider?: CourierProvider | null
) {
  await requireHumanOrgAccess(organizationId, 'EDITOR')

  await prisma.courierShipment.updateMany({
    where: { orderId, organizationId, consignmentId: null },
    data: { attempts: 0, nextAttemptAt: null },
  })

  return dispatchOrderInternal(organizationId, orderId, provider ?? null)
}

/**
 * Hands an order to a courier.
 *
 * The shipment row is written before the courier is called, and reused if one
 * already exists. That ordering is what makes a failed call recoverable: a
 * timeout leaves a PENDING row with the error on it, visible and retryable,
 * rather than a silent nothing that a merchant discovers when the customer
 * calls a week later.
 */
async function dispatchOrderInternal(
  organizationId: string,
  orderId: string,
  requestedProvider: CourierProvider | null
): Promise<{ ok: boolean; shipmentId: string | null; error?: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      orderNumber: true,
      phone: true,
      email: true,
      totalCents: true,
      paidTotalCents: true,
      currencyCode: true,
      note: true,
      cancelledAt: true,
      workflowState: true,
      shippingAddress: true,
      customer: { select: { firstName: true, lastName: true } },
      lines: {
        select: { title: true, quantity: true, weightGrams: true },
      },
      shipments: {
        where: { status: { not: 'CANCELLED' } },
        select: { id: true, consignmentId: true, status: true },
      },
    },
  })

  if (!order) return { ok: false, shipmentId: null, error: 'Order not found' }
  if (isOrderCancelled(order)) {
    return { ok: false, shipmentId: null, error: 'This order is cancelled' }
  }

  // Already at a courier. Not an error — a merchant double-clicking Dispatch
  // should get the existing parcel, not a second one.
  const live = order.shipments.find((shipment) => shipment.consignmentId)
  if (live) {
    return { ok: true, shipmentId: live.id }
  }

  const provider =
    requestedProvider ?? (await defaultCourierProvider(organizationId))

  if (!provider) {
    await noteDispatchFailure(
      orderId,
      'No courier is switched on for this workspace'
    )
    return {
      ok: false,
      shipmentId: null,
      error: 'No courier is switched on for this workspace',
    }
  }

  const address = readAddress(order.shippingAddress)
  const recipientPhone =
    normalizeBdPhone(order.phone) ?? normalizeBdPhone(address.phone)

  if (!recipientPhone) {
    await noteDispatchFailure(
      orderId,
      'This order has no usable Bangladeshi mobile number to deliver to'
    )
    return {
      ok: false,
      shipmentId: null,
      error: 'This order has no usable Bangladeshi mobile number',
    }
  }

  const recipientName =
    [address.firstName, address.lastName].filter(Boolean).join(' ').trim() ||
    [order.customer?.firstName, order.customer?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'Customer'

  const recipientAddress = formatAddress(address)

  // The order number as a courier can reference it. `#1001` is a fine thing to
  // show a customer and an invalid `invoice` at Steadfast, which rejects any
  // character outside letters, numbers, dashes and underscores.
  let merchantReference: string
  try {
    merchantReference = requireCourierInvoice(order.orderNumber)
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : 'Unusable order number'
    await noteDispatchFailure(orderId, message)
    return { ok: false, shipmentId: null, error: message }
  }

  // The rider collects whatever is still owed, not the order total — a
  // part-paid order must not be charged twice at the door.
  const codAmountCents = Math.max(0, order.totalCents - order.paidTotalCents)

  const config = await prisma.courierConfig.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { id: true },
  })

  // Reuse an undispatched row from a previous failed attempt so the attempt
  // count and the error history survive.
  const existing = order.shipments.find((shipment) => !shipment.consignmentId)

  const shipment = existing
    ? await prisma.courierShipment.update({
        where: { id: existing.id },
        data: {
          provider,
          courierConfigId: config?.id ?? null,
          // Refreshed, not just written on create: a row left behind by a
          // failed attempt still carries whatever reference that attempt used,
          // and rows created before order numbers were sanitised hold an
          // unsendable one. Without this line those orders retry forever
          // against the same rejected value.
          merchantOrderId: merchantReference,
          recipientName,
          recipientPhone,
          recipientAddress,
          codAmountCents,
        },
        select: { id: true, attempts: true },
      })
    : await prisma.courierShipment.create({
        data: {
          organizationId,
          orderId,
          courierConfigId: config?.id ?? null,
          provider,
          merchantOrderId: merchantReference,
          status: 'PENDING',
          codAmountCents,
          recipientName,
          recipientPhone,
          recipientAddress,
        },
        select: { id: true, attempts: true },
      })

  const request: CourierConsignmentRequest = {
    merchantOrderId: merchantReference,
    recipientName,
    recipientPhone,
    recipientAddress,
    codAmountCents,
    note: order.note,
    itemDescription: order.lines
      .map((line) => `${line.title} x${line.quantity}`)
      .join(', ')
      .slice(0, 220),
    itemQuantity: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    itemWeightKg: totalWeightKg(order.lines),
    alternativePhone: null,
    recipientEmail: order.email,
  }

  const attempt = shipment.attempts + 1

  try {
    const client = await courierClientFor(organizationId, provider)
    const result = await client.createConsignment(request)

    await prisma.$transaction(async (tx) => {
      await tx.courierShipment.update({
        where: { id: shipment.id },
        data: {
          consignmentId: result.consignmentId,
          trackingCode: result.trackingCode,
          status: result.status,
          rawStatus: result.rawStatus,
          statusMessage: `Handed to ${provider === 'STEADFAST' ? 'Steadfast' : 'Pathao'}`,
          deliveryFeeCents: result.deliveryFeeCents,
          requestPayload: request as never,
          responsePayload: toJson(result.raw),
          attempts: attempt,
          lastError: null,
          nextAttemptAt: null,
          dispatchedAt: new Date(),
          lastEventAt: new Date(),
        },
      })

      await tx.courierShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: result.status,
          message: `Consignment ${result.consignmentId} created`,
          source: 'SYSTEM',
          rawEvent: toJson(result.raw),
          occurredAt: new Date(),
        },
      })

      await tx.order.update({
        where: { id: orderId },
        data: { workflowState: 'DISPATCHED', workflowUpdatedAt: new Date() },
      })

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'courier_dispatched',
          message: `Sent to ${provider === 'STEADFAST' ? 'Steadfast' : 'Pathao'} — consignment ${result.consignmentId}`,
          metadata: {
            provider,
            consignmentId: result.consignmentId,
            trackingCode: result.trackingCode,
          },
        },
      })
    })

    await emitShipmentWebhook(organizationId, shipment.id, 'SHIPMENT_CREATED')

    // The customer's tracking link, sent the moment a parcel exists. Awaited
    // but internally guarded: it cannot fail the dispatch it is reporting.
    await sendDispatchNotification(organizationId, orderId, provider)

    return { ok: true, shipmentId: shipment.id }
  } catch (cause) {
    const retryable =
      cause instanceof CourierApiError
        ? cause.retryable
        : !(cause instanceof CourierNotConfiguredError)

    const message =
      cause instanceof Error ? cause.message : 'The courier rejected the parcel'

    const exhausted = attempt >= MAX_DISPATCH_ATTEMPTS || !retryable
    const backoff =
      DISPATCH_BACKOFF_SECONDS[attempt - 1] ??
      DISPATCH_BACKOFF_SECONDS[DISPATCH_BACKOFF_SECONDS.length - 1]!

    await prisma.courierShipment.update({
      where: { id: shipment.id },
      data: {
        attempts: attempt,
        lastError: message.slice(0, 500),
        // A permanent rejection — bad address, wrong credentials — is left for
        // a human. Retrying it just delays the person who has to fix it.
        nextAttemptAt: exhausted
          ? null
          : new Date(Date.now() + backoff * 1_000),
        requestPayload: request as never,
      },
    })

    await prisma.$transaction([
      prisma.orderEvent.create({
        data: {
          orderId,
          type: 'courier_dispatch_failed',
          message: exhausted
            ? `Could not send to the courier: ${message}`
            : `Courier attempt ${attempt} failed, retrying: ${message}`,
        },
      }),
      // Only a final failure moves the order — an order that is mid-retry is
      // still on its way and must not flip to FAILED and back.
      ...(exhausted
        ? [
            prisma.order.update({
              where: { id: orderId },
              data: { workflowState: 'FAILED', workflowUpdatedAt: new Date() },
            }),
          ]
        : []),
    ])

    return { ok: false, shipmentId: shipment.id, error: message }
  }
}

async function noteDispatchFailure(orderId: string, message: string) {
  await prisma.orderEvent.create({
    data: {
      orderId,
      type: 'courier_dispatch_failed',
      message,
    },
  })
  await prisma.order.update({
    where: { id: orderId },
    data: { workflowState: 'FAILED', workflowUpdatedAt: new Date() },
  })
}

// ── Manual status updates ────────────────────────────────────────────────

/** Order states whose meaning is "the goods are no longer in the building". */
const STATES_THAT_SHIP: ReadonlySet<OrderWorkflowState> = new Set([
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
])

/**
 * A person moves an order along the pipeline by hand.
 *
 * Not every parcel goes through a courier with an API. A shop delivers locally
 * on its own rider, hands the order over at the counter, or ships with a
 * neighbourhood service that reports nothing back — and those orders are still
 * orders: the stock has to leave, the cash has to be recorded, and the customer
 * still asks where it is. Without this they sit at PENDING forever and the
 * merchant's own order list stops describing their business.
 *
 * Everything the courier path does on the way past a state happens here too,
 * through the same helpers rather than a parallel copy of them: stock is
 * consumed once when the goods go out, restocked once if they come back, and
 * the customer's tracking link is minted so there is a page to send. The only
 * difference is who asserted the state — recorded on the order's timeline with
 * the name of whoever pressed the button.
 */
export async function setOrderWorkflowState(
  organizationId: string,
  orderId: string,
  input: {
    state: OrderWorkflowState
    note?: string
    /**
     * Whether to book the outstanding balance as collected. A hand delivery is
     * usually cash in hand, but not always — the merchant says which, because
     * guessing writes fiction into the ledger either way.
     */
    recordPayment?: boolean
  }
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  if (!isManualWorkflowState(input.state)) {
    throw new Error('That delivery status cannot be set by hand')
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      workflowState: true,
      cancelledAt: true,
      totalCents: true,
      paidTotalCents: true,
      shipments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, consignmentId: true },
      },
    },
  })
  if (!order) throw new Error('Order not found')
  if (isOrderCancelled(order)) throw new Error('This order has been cancelled')

  const state = input.state
  const note = input.note?.trim()
  const label = WORKFLOW_STATE_LABEL[state]
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { workflowState: state, workflowUpdatedAt: now },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'workflow_state_set',
        message: note
          ? `Delivery status set to "${label}" by hand — ${note}`
          : `Delivery status set to "${label}" by hand`,
        actorUserId: session.user.id,
      },
    })

    // An order that is also at a courier has two sources of truth, and the
    // courier wins: the order's state is derived from its parcels, so the next
    // webhook or reconciliation poll would put this straight back where the
    // courier last left it. Writing the correction onto the consignment as well
    // is what makes it hold — and it is honest, because a merchant who marks a
    // parcel delivered is telling us the courier's last word is stale.
    const shipment = order.shipments[0]
    const shipmentStatus = shipmentStatusFor(state)
    if (shipment?.consignmentId && shipmentStatus) {
      await tx.courierShipment.update({
        where: { id: shipment.id },
        data: {
          status: shipmentStatus,
          statusMessage: note ? `Set by hand — ${note}` : 'Set by hand',
          lastEventAt: now,
          ...(shipmentStatus === 'DELIVERED' ? { deliveredAt: now } : {}),
        },
      })

      await tx.courierShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: shipmentStatus,
          message: note
            ? `${label} — ${note}`
            : `${label}, set by the merchant`,
          source: 'SYSTEM',
          occurredAt: now,
        },
      })
    }
  })

  // Each of these is idempotent on its own timestamp, so walking an order up
  // the ladder one state at a time moves the stock exactly once — the same
  // guarantee the courier path relies on when a parcel emits four events.
  if (STATES_THAT_SHIP.has(state)) {
    await consumeStockForDispatch(
      organizationId,
      orderId,
      `manual:${orderId}`,
      'Marked as sent out by hand — stock released'
    )
  }

  if (state === 'RETURNED') {
    await restockReturnedParcel(
      organizationId,
      orderId,
      'Marked as returned by hand — stock returned to inventory'
    )
  }

  if (
    input.recordPayment &&
    (state === 'DELIVERED' || state === 'PARTIALLY_DELIVERED') &&
    order.totalCents > order.paidTotalCents
  ) {
    await markOrderPaid(organizationId, orderId)
  }

  // Minted here for the same reason dispatch mints it: this is the moment
  // there is something for the customer to follow. A shop's own delivery has
  // no courier page to link to, so this is the only tracking page there is.
  const trackingToken = await ensureTrackingToken(orderId)

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return { ok: true as const, trackingToken }
}

// ── Inbound status updates ───────────────────────────────────────────────

export interface IncomingCourierEvent {
  status: CourierShipmentStatus
  rawStatus: string | null
  message: string
  occurredAt: Date
  collectedAmountCents?: number | null
  deliveryFeeCents?: number | null
  raw: unknown
  source: CourierEventSource
}

/**
 * Finds the shipment an inbound event belongs to.
 *
 * Scoped to one organisation by the caller, which resolves it from the webhook
 * token in the URL. Matching on the consignment id first and the merchant order
 * id second matters because Pathao's early events carry a consignment id we may
 * not have stored yet if the create response was lost in flight.
 */
export async function findShipmentForEvent(
  organizationId: string,
  provider: CourierProvider,
  reference: { consignmentId?: string | null; merchantOrderId?: string | null }
) {
  if (reference.consignmentId) {
    const byConsignment = await prisma.courierShipment.findFirst({
      where: {
        organizationId,
        provider,
        consignmentId: String(reference.consignmentId),
      },
      select: { id: true },
    })
    if (byConsignment) return byConsignment
  }

  if (reference.merchantOrderId) {
    const byOrder = await prisma.courierShipment.findFirst({
      where: {
        organizationId,
        provider,
        merchantOrderId: String(reference.merchantOrderId),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (byOrder) {
      // Backfill the consignment id we now know, so the next event resolves on
      // the indexed lookup instead of the fallback.
      if (reference.consignmentId) {
        await prisma.courierShipment
          .update({
            where: { id: byOrder.id },
            data: { consignmentId: String(reference.consignmentId) },
          })
          .catch(() => {
            // A unique-constraint clash means another row already claims that
            // consignment id; the event still belongs to this shipment.
          })
      }
      return byOrder
    }
  }

  return null
}

/**
 * Takes a parsed courier callback and does whatever it implies.
 *
 * The single entry point for both webhook routes, so the two providers cannot
 * drift apart in how an event is applied. Returns rather than throws on a
 * parcel it cannot find: an unknown consignment is a normal occurrence — a test
 * event from the courier's panel, a parcel created outside this platform — and
 * answering it with a 500 makes the courier retry a callback that will never
 * match.
 */
export async function ingestCourierEvent(
  organizationId: string,
  provider: CourierProvider,
  parsed: {
    consignmentId: string | null
    merchantOrderId: string | null
    status: CourierShipmentStatus | null
    rawStatus: string | null
    message: string
    occurredAt: Date
    collectedAmountCents: number | null
    deliveryFeeCents: number | null
  },
  raw: unknown,
  source: CourierEventSource = 'WEBHOOK'
): Promise<{ handled: boolean; reason?: string }> {
  const shipment = await findShipmentForEvent(organizationId, provider, {
    consignmentId: parsed.consignmentId,
    merchantOrderId: parsed.merchantOrderId,
  })

  if (!shipment) {
    return { handled: false, reason: 'No matching parcel for this workspace' }
  }

  // A status-less update — Steadfast's `tracking_update` — is a progress note,
  // not a state change. It belongs on the timeline the customer reads, but
  // writing it as a status would overwrite a known state with a guess.
  if (!parsed.status) {
    const current = await prisma.courierShipment.findUnique({
      where: { id: shipment.id },
      select: { status: true },
    })
    if (!current) return { handled: false }

    const duplicate = await prisma.courierShipmentEvent.findFirst({
      where: {
        shipmentId: shipment.id,
        message: parsed.message.slice(0, 500),
        occurredAt: parsed.occurredAt,
      },
      select: { id: true },
    })
    if (duplicate) return { handled: true }

    await prisma.$transaction([
      prisma.courierShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: current.status,
          message: parsed.message.slice(0, 500),
          source,
          rawEvent: toJson(raw),
          occurredAt: parsed.occurredAt,
        },
      }),
      prisma.courierShipment.update({
        where: { id: shipment.id },
        data: {
          statusMessage: parsed.message.slice(0, 500),
          lastEventAt: new Date(),
        },
      }),
    ])

    return { handled: true }
  }

  await applyCourierEvent(shipment.id, {
    status: parsed.status,
    rawStatus: parsed.rawStatus,
    message: parsed.message,
    occurredAt: parsed.occurredAt,
    collectedAmountCents: parsed.collectedAmountCents,
    deliveryFeeCents: parsed.deliveryFeeCents,
    raw,
    source,
  })

  return { handled: true }
}

/**
 * Records an event against a parcel and moves everything downstream of it.
 *
 * Idempotent by design. Couriers retry, and the same "delivered" arrives three
 * times: the duplicate check drops repeats, and the terminal-state guard means
 * a late out-of-order event cannot un-deliver a parcel.
 */
export async function applyCourierEvent(
  shipmentId: string,
  event: IncomingCourierEvent
): Promise<void> {
  const shipment = await prisma.courierShipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      organizationId: true,
      orderId: true,
      status: true,
      provider: true,
      codAmountCents: true,
    },
  })
  if (!shipment) return

  // Same status, same instant, already recorded. Couriers resend on any
  // non-2xx, and a receiver that appends every retry produces a timeline the
  // merchant cannot read.
  const duplicate = await prisma.courierShipmentEvent.findFirst({
    where: {
      shipmentId,
      status: event.status,
      occurredAt: event.occurredAt,
    },
    select: { id: true },
  })

  const terminal = isTerminal(shipment.status)
  // A terminal parcel accepts nothing but a correction to another terminal
  // state — a delivered parcel later marked returned is real; a delivered
  // parcel later marked "in transit" is a retry arriving late.
  const regressive = terminal && !isTerminal(event.status)

  await prisma.$transaction(async (tx) => {
    if (!duplicate) {
      await tx.courierShipmentEvent.create({
        data: {
          shipmentId,
          status: event.status,
          message: event.message.slice(0, 500),
          source: event.source,
          rawEvent: toJson(event.raw),
          occurredAt: event.occurredAt,
        },
      })
    }

    await tx.courierShipment.update({
      where: { id: shipmentId },
      data: {
        ...(regressive
          ? {}
          : {
              status: event.status,
              rawStatus: event.rawStatus,
              statusMessage: event.message.slice(0, 500),
            }),
        ...(event.collectedAmountCents != null
          ? { collectedAmountCents: event.collectedAmountCents }
          : {}),
        ...(event.deliveryFeeCents != null
          ? { deliveryFeeCents: event.deliveryFeeCents }
          : {}),
        ...(event.status === 'DELIVERED' && !regressive
          ? { deliveredAt: event.occurredAt }
          : {}),
        ...(event.status === 'CANCELLED' && !regressive
          ? { cancelledAt: event.occurredAt }
          : {}),
        lastEventAt: new Date(),
      },
    })
  })

  if (regressive) return

  await syncOrderFromShipments(shipment.organizationId, shipment.orderId)

  // Goods physically left once the courier has them, and inventory should say
  // so. Guarded inside so repeated pickup events do not fulfil twice.
  if (
    event.status === 'PICKED_UP' ||
    event.status === 'IN_TRANSIT' ||
    event.status === 'OUT_FOR_DELIVERY' ||
    event.status === 'DELIVERED'
  ) {
    await consumeStockForDispatch(
      shipment.organizationId,
      shipment.orderId,
      shipmentId
    )
  }

  if (event.status === 'DELIVERED') {
    await settleCashOnDelivery(
      shipment.organizationId,
      shipment.orderId,
      event.collectedAmountCents ?? shipment.codAmountCents
    )
    await emitShipmentWebhook(
      shipment.organizationId,
      shipmentId,
      'SHIPMENT_DELIVERED'
    )
  } else if (event.status === 'RETURNED') {
    await restockReturnedParcel(shipment.organizationId, shipment.orderId)
    await emitShipmentWebhook(
      shipment.organizationId,
      shipmentId,
      'SHIPMENT_RETURNED'
    )
  } else if (!duplicate) {
    await emitShipmentWebhook(
      shipment.organizationId,
      shipmentId,
      'SHIPMENT_UPDATED'
    )
  }
}

/**
 * Recomputes an order's pipeline state from its parcels.
 *
 * Derived rather than asserted, and derived from the *least* advanced live
 * parcel: an order split across two consignments is only delivered when both
 * are, and telling a merchant it arrived while half of it is still on a van is
 * worse than saying nothing.
 */
async function syncOrderFromShipments(
  organizationId: string,
  orderId: string
): Promise<void> {
  const shipments = await prisma.courierShipment.findMany({
    where: { orderId },
    select: { status: true },
  })

  const states = shipments
    .map((shipment) => workflowStateFor(shipment.status))
    .filter((state): state is OrderWorkflowState => state !== null)

  if (states.length === 0) return

  // Ranked by how far along the pipeline each state is. The minimum wins.
  const RANK: Record<OrderWorkflowState, number> = {
    PENDING: 0,
    FRAUD_REVIEW: 0,
    PROCESSING: 1,
    FAILED: 2,
    CANCELLED: 3,
    DISPATCHED: 4,
    IN_TRANSIT: 5,
    OUT_FOR_DELIVERY: 6,
    RETURNED: 7,
    PARTIALLY_DELIVERED: 8,
    DELIVERED: 9,
  }

  const next = states.reduce((lowest, state) =>
    RANK[state] < RANK[lowest] ? state : lowest
  )

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      workflowState: true,
      workflowUpdatedAt: true,
      cancelledAt: true,
    },
  })
  if (!order) return

  // A cancelled order is finished, and its parcels draining through the
  // courier's pipeline afterwards do not restart it. Without this, cancelling
  // an order that was already on a van put it back to "In transit" on the next
  // webhook — the merchant cancels it, walks away, and finds it moving again.
  // The parcel's own status keeps updating and is still shown on the delivery
  // panel; it is the *order* that stays cancelled.
  if (isOrderCancelled(order)) return

  if (order.workflowState === next) return

  const now = new Date()

  await prisma.order.update({
    where: { id: orderId },
    data: {
      workflowState: next,
      workflowUpdatedAt: now,
      // The courier refused or cancelled the consignment, so the order is
      // cancelled — and says when. Stamped only if nothing else has: this is
      // the courier's word, not a second cancellation, and it must not
      // overwrite the timestamp and reason a merchant's own cancel recorded.
      // Deliberately no restock: nobody has said the goods are back on a
      // shelf, and inventing that is worse than leaving it to the return flow.
      ...(next === 'CANCELLED'
        ? { cancelledAt: now, cancelReason: 'OTHER' as const }
        : {}),
    },
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')
}

/**
 * Creates the fulfilment for a parcel the courier now physically holds.
 *
 * Stock was reserved at checkout (`available` down, `committed` up); this is
 * the step that consumes the commitment. Skipped entirely if the merchant
 * already fulfilled by hand, so the two routes cannot double-count.
 */
async function consumeStockForDispatch(
  organizationId: string,
  orderId: string,
  /**
   * What the inventory ledger will name as the cause. A consignment id for a
   * courier pickup, `manual:<order>` for goods a merchant handed over
   * themselves — either way the adjustment has to point back at something a
   * person can look up.
   */
  reference: string,
  message = 'Courier collected the parcel — stock released'
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      storeId: true,
      stockConsumedAt: true,
      lines: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          requiresShipping: true,
        },
      },
    },
  })

  // The timestamp is the whole guard. A parcel emits pickup, in-transit and
  // out-for-delivery in sequence and any of them can arrive twice; stock must
  // move on the first and never again.
  if (!order || order.stockConsumedAt) return

  const shipped = order.lines.filter((line) => line.requiresShipping)
  if (shipped.length === 0) return

  const locationId = await resolveStoreLocationId(
    prisma,
    organizationId,
    order.storeId
  )

  await prisma.$transaction(async (tx) => {
    await consumeCommittedStock(
      tx,
      reference,
      locationId,
      shipped.map((line) => ({
        variantId: line.variantId ?? '',
        quantity: line.quantity,
        inventoryTracked: Boolean(line.variantId),
      }))
    )

    await tx.order.update({
      where: { id: orderId },
      data: { stockConsumedAt: new Date() },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'stock_consumed',
        message,
      },
    })
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_FULFILLED')
}

/**
 * Records the money the rider collected at the door.
 *
 * This is the moment a cash-on-delivery order actually becomes paid, and
 * without it every delivered COD order sits at PENDING forever and the
 * merchant's revenue reporting is fiction. Written through the same Transaction
 * ledger as any other payment so the order's totals stay reconstructable.
 */
async function settleCashOnDelivery(
  organizationId: string,
  orderId: string,
  collectedCents: number
): Promise<void> {
  if (collectedCents <= 0) return

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      totalCents: true,
      paidTotalCents: true,
      currencyCode: true,
    },
  })
  if (!order) return

  const outstanding = order.totalCents - order.paidTotalCents
  if (outstanding <= 0) return

  // Never credit more than is owed, whatever the courier reports. An
  // over-collection is a dispute for the merchant to settle, not a number to
  // silently write into the ledger.
  const amount = Math.min(outstanding, collectedCents)

  await prisma.$transaction(async (tx) => {
    await tx.transaction.create({
      data: {
        orderId,
        kind: 'SALE',
        status: 'SUCCESS',
        provider: 'CASH_ON_DELIVERY',
        amountCents: amount,
        currencyCode: order.currencyCode,
      },
    })

    const paid = order.paidTotalCents + amount

    await tx.order.update({
      where: { id: orderId },
      data: {
        paidTotalCents: paid,
        financialStatus: paid >= order.totalCents ? 'PAID' : 'PARTIALLY_PAID',
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'payment_captured',
        message: 'Cash collected on delivery by the courier',
      },
    })
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')
}

/**
 * Puts a refused parcel's goods back on the shelf.
 *
 * Written out rather than routed through `restockInventory`, which stamps every
 * adjustment REFUND. A courier return is not a refund — no money moved, and in
 * a cash-on-delivery order none ever did. Logging it as one would make the
 * inventory ledger, which exists precisely to answer "how did this variant get
 * to -3", tell the merchant a story that never happened.
 */
async function restockReturnedParcel(
  organizationId: string,
  orderId: string,
  message = 'Courier returned the parcel — stock returned to inventory'
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      storeId: true,
      stockConsumedAt: true,
      stockRestoredAt: true,
      lines: {
        select: { id: true, variantId: true, quantity: true },
      },
    },
  })
  // Already restocked. Couriers resend "returned" and this must not add stock
  // twice. Nothing to restore either if the goods never left — a parcel refused
  // before pickup was never taken out of stock in the first place.
  if (!order || order.stockRestoredAt || !order.stockConsumedAt) return

  const returnable = order.lines
    .filter((line) => line.variantId && line.quantity > 0)
    .map((line) => ({
      variantId: line.variantId!,
      quantity: line.quantity,
    }))

  await prisma.$transaction(async (tx) => {
    const tracked = new Set(
      (
        await tx.productVariant.findMany({
          where: {
            id: { in: returnable.map((line) => line.variantId) },
            inventoryTracked: true,
          },
          select: { id: true },
        })
      ).map((variant) => variant.id)
    )

    for (const line of returnable) {
      if (!tracked.has(line.variantId)) continue

      const level = await tx.inventoryLevel.findFirst({
        where: { variantId: line.variantId },
        orderBy: { available: 'desc' },
        select: { id: true, locationId: true },
      })
      if (!level) continue

      await tx.inventoryLevel.update({
        where: { id: level.id },
        data: { available: { increment: line.quantity } },
      })

      await tx.inventoryAdjustment.create({
        data: {
          locationId: level.locationId,
          variantId: line.variantId,
          delta: line.quantity,
          reason: 'RESTOCK',
          referenceId: `courier-return:${orderId}`,
        },
      })
    }

    await tx.order.update({
      where: { id: orderId },
      data: { stockRestoredAt: new Date() },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'parcel_returned',
        message,
      },
    })
  })
}

// ── Scheduled work ───────────────────────────────────────────────────────

/**
 * Sends the orders whose dispatch is now due.
 *
 * Covers both halves of the delayed pipeline: orders held back by the
 * merchant's dispatch delay, and shipments whose courier call failed and whose
 * backoff has elapsed.
 */
export async function runDueDispatches(limit = 50): Promise<number> {
  const now = new Date()

  const retries = await prisma.courierShipment.findMany({
    where: {
      status: 'PENDING',
      consignmentId: null,
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { organizationId: true, orderId: true, provider: true },
  })

  for (const shipment of retries) {
    await dispatchOrderInternal(
      shipment.organizationId,
      shipment.orderId,
      shipment.provider
    ).catch((cause) => console.error('[courier] retry failed', cause))
  }

  // Orders approved (by screen or by hand) that have no parcel yet. Their delay
  // window is checked per organisation, because it is a per-merchant setting.
  const waiting = await prisma.order.findMany({
    where: {
      workflowState: 'PROCESSING',
      cancelledAt: null,
      shipments: { none: {} },
    },
    orderBy: { workflowUpdatedAt: 'asc' },
    take: limit,
    select: { id: true, organizationId: true, workflowUpdatedAt: true },
  })

  const settingsByOrg = new Map<
    string,
    Awaited<ReturnType<typeof getCourierSettings>>
  >()

  let dispatched = 0
  for (const order of waiting) {
    let settings = settingsByOrg.get(order.organizationId)
    if (!settings) {
      settings = await getCourierSettings(order.organizationId)
      settingsByOrg.set(order.organizationId, settings)
    }

    const dueAt = new Date(
      order.workflowUpdatedAt.getTime() + settings.dispatchDelayMinutes * 60_000
    )
    if (dueAt > now) continue

    await dispatchOrderInternal(order.organizationId, order.id, null).catch(
      (cause) => console.error('[courier] scheduled dispatch failed', cause)
    )
    dispatched += 1
  }

  return retries.length + dispatched
}

/**
 * Polls couriers about parcels that have gone quiet.
 *
 * The reason this exists rather than trusting webhooks: a webhook that is
 * dropped is dropped silently. There is no failed delivery to retry, no error
 * in a log — the parcel simply stops updating, and nobody notices until a
 * customer asks. Asking the courier directly is the only way to close that gap.
 */
export async function syncStaleShipments(limit = 50): Promise<number> {
  const quietBefore = new Date(Date.now() - POLL_AFTER_QUIET_MINUTES * 60_000)

  const stale = await prisma.courierShipment.findMany({
    where: {
      consignmentId: { not: null },
      status: {
        notIn: ['DELIVERED', 'RETURNED', 'CANCELLED', 'PARTIALLY_DELIVERED'],
      },
      OR: [
        { lastEventAt: { lte: quietBefore } },
        { lastEventAt: null, createdAt: { lte: quietBefore } },
      ],
    },
    // Round-robin: the least recently polled go first, so one busy organisation
    // cannot starve everyone else's parcels.
    orderBy: [{ lastPolledAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
    select: {
      id: true,
      organizationId: true,
      provider: true,
      consignmentId: true,
      merchantOrderId: true,
      trackingCode: true,
    },
  })

  let updated = 0

  for (const shipment of stale) {
    await prisma.courierShipment.update({
      where: { id: shipment.id },
      data: { lastPolledAt: new Date() },
    })

    try {
      const client = await courierClientFor(
        shipment.organizationId,
        shipment.provider
      )

      const status: CourierStatusResult | null = await client.fetchStatus({
        consignmentId: shipment.consignmentId,
        merchantOrderId: shipment.merchantOrderId,
        trackingCode: shipment.trackingCode,
      })
      if (!status) continue

      await applyCourierEvent(shipment.id, {
        status: status.status,
        rawStatus: status.rawStatus,
        message: status.message ?? 'Status refreshed from the courier',
        occurredAt: status.occurredAt,
        collectedAmountCents: status.collectedAmountCents,
        deliveryFeeCents: status.deliveryFeeCents,
        raw: status.raw,
        source: 'POLL',
      })
      updated += 1
    } catch (cause) {
      // A courier being down must not stop the sweep reaching the next parcel.
      console.error('[courier] poll failed for', shipment.id, cause)
    }
  }

  return updated
}

// ── Reading ──────────────────────────────────────────────────────────────

export async function getShipmentForOrder(
  organizationId: string,
  orderId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.courierShipment.findFirst({
    where: { organizationId, orderId },
    orderBy: { createdAt: 'desc' },
    include: {
      events: { orderBy: { occurredAt: 'desc' }, take: 50 },
    },
  })
}

/**
 * Public parcel tracking.
 *
 * Requires the order number *and* the phone number it was placed with. An order
 * number alone is guessable — they are sequential — and a tracking page that
 * takes one would hand a stranger a customer's name, address and order value.
 * The phone number is the shared secret that makes the pair safe to expose
 * without a login.
 */
export async function trackParcelPublicly(
  organizationId: string,
  orderNumber: string,
  phone: string
) {
  const normalised = normalizeBdPhone(phone)
  if (!normalised) return null

  const order = await prisma.order.findFirst({
    where: {
      organizationId,
      // Merchants write "#1001" on a receipt and customers type "1001".
      orderNumber: {
        in: [orderNumber.trim(), `#${orderNumber.trim().replace(/^#/, '')}`],
      },
    },
    select: {
      id: true,
      orderNumber: true,
      phone: true,
      workflowState: true,
      workflowUpdatedAt: true,
      cancelledAt: true,
      createdAt: true,
      totalCents: true,
      currencyCode: true,
      shippingAddress: true,
      shipments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          provider: true,
          status: true,
          statusMessage: true,
          trackingCode: true,
          consignmentId: true,
          dispatchedAt: true,
          deliveredAt: true,
          events: {
            orderBy: { occurredAt: 'desc' },
            take: 20,
            select: { status: true, message: true, occurredAt: true },
          },
        },
      },
    },
  })

  if (!order) return null

  const onOrder =
    normalizeBdPhone(order.phone) ??
    normalizeBdPhone(readAddressPhone(order.shippingAddress))

  // Wrong phone reads exactly like a missing order, so the endpoint cannot be
  // used to confirm that an order number exists.
  if (onOrder !== normalised) return null

  const shipment = order.shipments[0] ?? null

  return {
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,
    // The merged status, so a buyer whose order was cancelled is not told it
    // is still pending on the one page they were given to check.
    workflowState: orderStatus(order),
    totalCents: order.totalCents,
    currencyCode: order.currencyCode,
    // Deliberately no address, no email, no line items: the customer knows what
    // they ordered, and this page is reachable by anyone holding two facts.
    courier: shipment
      ? {
          provider: shipment.provider,
          status: shipment.status,
          message: shipment.statusMessage,
          trackingCode: shipment.trackingCode ?? shipment.consignmentId,
          trackingUrl: trackingUrlFor(
            shipment.provider,
            shipment.trackingCode ?? shipment.consignmentId
          ),
          dispatchedAt: shipment.dispatchedAt,
          deliveredAt: shipment.deliveredAt,
          events: shipment.events,
        }
      : null,
  }
}

/** The courier's own tracking page, for a customer who wants the source. */
export function trackingUrlFor(
  provider: CourierProvider,
  code: string | null
): string | null {
  if (!code) return null
  return provider === 'STEADFAST'
    ? `https://steadfast.com.bd/t/${encodeURIComponent(code)}`
    : `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(code)}`
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function emitShipmentWebhook(
  organizationId: string,
  shipmentId: string,
  topic:
    | 'SHIPMENT_CREATED'
    | 'SHIPMENT_UPDATED'
    | 'SHIPMENT_DELIVERED'
    | 'SHIPMENT_RETURNED'
): Promise<void> {
  const shipment = await prisma.courierShipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      provider: true,
      status: true,
      rawStatus: true,
      statusMessage: true,
      consignmentId: true,
      trackingCode: true,
      merchantOrderId: true,
      codAmountCents: true,
      collectedAmountCents: true,
      deliveryFeeCents: true,
      dispatchedAt: true,
      deliveredAt: true,
      order: { select: { id: true, orderNumber: true } },
    },
  })
  if (!shipment) return

  await emitWebhook(organizationId, topic, {
    id: shipment.id,
    orderId: shipment.order.id,
    orderNumber: shipment.order.orderNumber,
    provider: shipment.provider.toLowerCase(),
    status: shipment.status.toLowerCase(),
    courierStatus: shipment.rawStatus,
    message: shipment.statusMessage,
    consignmentId: shipment.consignmentId,
    trackingCode: shipment.trackingCode,
    trackingUrl: trackingUrlFor(
      shipment.provider,
      shipment.trackingCode ?? shipment.consignmentId
    ),
    codAmountCents: shipment.codAmountCents,
    collectedAmountCents: shipment.collectedAmountCents,
    deliveryFeeCents: shipment.deliveryFeeCents,
    dispatchedAt: shipment.dispatchedAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
  })
}

interface AddressShape {
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  provinceCode?: string
  countryCode?: string
  postalCode?: string
  phone?: string
}

function readAddress(raw: unknown): AddressShape {
  return raw && typeof raw === 'object' ? (raw as AddressShape) : {}
}

function readAddressPhone(raw: unknown): string | null {
  return readAddress(raw).phone ?? null
}

/**
 * Flattens a structured address into the single line both couriers take.
 *
 * Neither accepts fields; both want one string a rider can read. Order matters
 * — street first, area last — because that is how an address is spoken in
 * Bangladesh and how a rider will parse it.
 */
function formatAddress(address: AddressShape): string {
  return (
    [
      address.address1,
      address.address2,
      address.city,
      address.provinceCode,
      address.postalCode,
    ]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(', ') || 'Address not provided'
  )
}

function totalWeightKg(
  lines: { quantity: number; weightGrams: number | null }[]
): number {
  const grams = lines.reduce(
    (sum, line) => sum + (line.weightGrams ?? 0) * line.quantity,
    0
  )
  // Zero is not a weight a courier accepts; their floor is applied in the
  // client, so this just avoids sending a nonsense number.
  return grams > 0 ? grams / 1000 : 0.5
}

/** Prisma's Json column rejects `undefined`; a round-trip normalises it away. */
function toJson(data: unknown) {
  return JSON.parse(JSON.stringify(data ?? {}))
}

// ── Customer-facing tracking ─────────────────────────────────────────────

/**
 * Mints the order's public tracking token, once.
 *
 * Idempotent by returning the existing one: the link is emailed when the parcel
 * is dispatched, and a re-dispatch or a retried email must not invalidate a URL
 * the customer already has.
 */
async function ensureTrackingToken(orderId: string): Promise<string> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: { trackingToken: true },
  })
  if (existing?.trackingToken) return existing.trackingToken

  const token = randomUUID().replace(/-/g, '')
  await prisma.order.update({
    where: { id: orderId },
    data: { trackingToken: token },
  })
  return token
}

/**
 * Emails the customer their tracking link when the parcel reaches the courier.
 *
 * Never throws. A mail server being down is not a reason to fail a dispatch
 * that already succeeded — the parcel exists either way, and the merchant can
 * resend from the order page.
 */
async function sendDispatchNotification(
  organizationId: string,
  orderId: string,
  provider: CourierProvider
): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      select: {
        email: true,
        orderNumber: true,
        store: { select: { name: true } },
        organization: { select: { name: true } },
      },
    })
    // No email address is the normal case for a phone-only COD order, not an
    // error. There is simply nowhere to send it.
    if (!order?.email) return

    const token = await ensureTrackingToken(orderId)
    const origin = (process.env.AUTH_URL ?? '').replace(/\/$/, '')

    const { subject, html, text } = orderDispatchedEmail({
      orderNumber: order.orderNumber,
      storeName: order.store?.name ?? order.organization.name,
      courierName: provider === 'STEADFAST' ? 'Steadfast' : 'Pathao',
      trackingUrl: `${origin}/track/${token}`,
    })

    await sendEmail({
      purpose: 'ORDER_RECEIPT',
      to: order.email,
      subject,
      html,
      text,
    })
  } catch (cause) {
    console.error('[courier] dispatch email failed for', orderId, cause)
  }
}

/**
 * The customer's view of their parcel, by token.
 *
 * Returns everything the courier has said about it, in order. The rider's own
 * notes are included deliberately: "customer asked to deliver tomorrow" is the
 * single most useful line on the page, and withholding it is what generates the
 * phone call this page exists to prevent.
 */
export async function trackParcelByToken(token: string) {
  if (!token) return null

  const order = await prisma.order.findUnique({
    where: { trackingToken: token },
    select: {
      orderNumber: true,
      workflowState: true,
      workflowUpdatedAt: true,
      cancelledAt: true,
      createdAt: true,
      totalCents: true,
      currencyCode: true,
      paidTotalCents: true,
      store: { select: { name: true } },
      organization: { select: { name: true } },
      // The picture as well as the title: "is this the thing I bought" is the
      // question this page is open to answer, and a product name in a font the
      // buyer has never seen answers it poorly.
      lines: {
        select: {
          title: true,
          quantity: true,
          ...ORDER_LINE_IMAGE_SELECT,
        },
      },
      shipments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          provider: true,
          status: true,
          statusMessage: true,
          trackingCode: true,
          consignmentId: true,
          dispatchedAt: true,
          deliveredAt: true,
          events: {
            orderBy: { occurredAt: 'desc' },
            select: {
              id: true,
              status: true,
              message: true,
              occurredAt: true,
            },
          },
        },
      },
    },
  })
  if (!order) return null

  const shipment = order.shipments[0] ?? null

  return {
    orderNumber: order.orderNumber,
    workflowState: orderStatus(order),
    placedAt: order.createdAt,
    storeName: order.store?.name ?? order.organization.name,
    totalCents: order.totalCents,
    currencyCode: order.currencyCode,
    amountDueCents: Math.max(0, order.totalCents - order.paidTotalCents),
    items: order.lines.map((line) => ({
      title: line.title,
      quantity: line.quantity,
      imageUrl: orderLineImageUrl(line),
    })),
    courier: shipment
      ? {
          provider: shipment.provider,
          status: shipment.status,
          statusMessage: shipment.statusMessage,
          trackingCode: shipment.trackingCode ?? shipment.consignmentId,
          trackingUrl: trackingUrlFor(
            shipment.provider,
            shipment.trackingCode ?? shipment.consignmentId
          ),
          dispatchedAt: shipment.dispatchedAt,
          deliveredAt: shipment.deliveredAt,
          events: shipment.events,
        }
      : null,
  }
}
