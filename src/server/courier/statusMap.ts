import type {
  CourierShipmentStatus,
  OrderWorkflowState,
} from '@/generated/prisma/enums'

/**
 * Translating each courier's vocabulary into one ladder.
 *
 * Steadfast reports a handful of statuses, several of which are approval
 * states of its own back office (`delivered_approval_pending`). Pathao reports
 * two dozen event names describing a parcel's physical journey. A merchant
 * running both does not want to learn two vocabularies to answer "where is it",
 * so both are mapped onto CourierShipmentStatus and the provider's own wording
 * is preserved alongside it.
 *
 * Unmapped values return UNKNOWN rather than a plausible guess. A courier that
 * introduces a status we have not seen must show up as something the merchant
 * can query, not be silently rounded to IN_TRANSIT — that is how a returned
 * parcel sits unnoticed for two weeks.
 */

/**
 * Steadfast delivery statuses, from the V1 API docs.
 *
 * The `*_approval_pending` family is worth reading carefully: the parcel has
 * physically been delivered or refused, and Steadfast's own admin has yet to
 * sign off the balance. Mapping `delivered_approval_pending` to DELIVERED would
 * be wrong — the money is not settled and the merchant should not treat the
 * order as closed — so it maps to the state that says "at the door, awaiting
 * confirmation" instead.
 */
const STEADFAST_STATUS: Record<string, CourierShipmentStatus> = {
  // Steadfast's `pending` does not mean "waiting to be sent" — it is the state a
  // consignment enters once the courier physically has the parcel, replacing
  // `in_review`. Read as English it looks like the opposite, and mapping it to
  // IN_TRANSIT overstated things in the other direction: the merchant's
  // question at this point is "did it reach the courier", and the answer is yes.
  pending: 'PICKED_UP',
  in_review: 'SUBMITTED',
  hold: 'ON_HOLD',
  delivered: 'DELIVERED',
  partial_delivered: 'PARTIALLY_DELIVERED',
  cancelled: 'RETURNED',
  delivered_approval_pending: 'OUT_FOR_DELIVERY',
  partial_delivered_approval_pending: 'OUT_FOR_DELIVERY',
  cancelled_approval_pending: 'OUT_FOR_DELIVERY',
  unknown_approval_pending: 'UNKNOWN',
  unknown: 'UNKNOWN',
}

/**
 * Pathao webhook event names, from the merchant webhook docs.
 *
 * `order.returned` and `order.returned-to-merchant` are distinct on purpose:
 * the first says the customer refused it, the second says the merchant has it
 * back in hand. Both matter — the first is when to stop expecting the money,
 * the second is when to restock.
 */
const PATHAO_EVENT: Record<string, CourierShipmentStatus> = {
  'order.created': 'SUBMITTED',
  'order.updated': 'SUBMITTED',
  'order.pickup-requested': 'PICKUP_PENDING',
  'order.assigned-for-pickup': 'PICKUP_PENDING',
  'order.picked': 'PICKED_UP',
  'order.pickup-failed': 'ON_HOLD',
  'order.pickup-cancelled': 'CANCELLED',
  'order.at-the-sorting-hub': 'IN_TRANSIT',
  'order.in-transit': 'IN_TRANSIT',
  'order.received-at-last-mile-hub': 'IN_TRANSIT',
  'order.assigned-for-delivery': 'OUT_FOR_DELIVERY',
  'order.delivered': 'DELIVERED',
  'order.partial-delivery': 'PARTIALLY_DELIVERED',
  'order.returned': 'RETURNED',
  'order.delivery-failed': 'DELIVERY_FAILED',
  'order.on-hold': 'ON_HOLD',
  'order.paid': 'DELIVERED',
  'order.paid-return': 'RETURNED',
  'order.exchanged': 'PARTIALLY_DELIVERED',
  'order.return-id-created': 'RETURN_IN_TRANSIT',
  'order.return-in-transit': 'RETURN_IN_TRANSIT',
  'order.returned-to-merchant': 'RETURNED',
}

/**
 * Pathao's polled `order_status_slug`, which is a different vocabulary from its
 * webhook events — the same parcel reads `Delivered` on the info endpoint and
 * `order.delivered` on the webhook.
 */
const PATHAO_SLUG: Record<string, CourierShipmentStatus> = {
  pending: 'SUBMITTED',
  'pickup-requested': 'PICKUP_PENDING',
  'assigned-for-pickup': 'PICKUP_PENDING',
  picked: 'PICKED_UP',
  'pickup-failed': 'ON_HOLD',
  'pickup-cancelled': 'CANCELLED',
  'at-the-sorting-hub': 'IN_TRANSIT',
  'in-transit': 'IN_TRANSIT',
  'received-at-last-mile-hub': 'IN_TRANSIT',
  'assigned-for-delivery': 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  'partial-delivery': 'PARTIALLY_DELIVERED',
  returned: 'RETURNED',
  'delivery-failed': 'DELIVERY_FAILED',
  'on-hold': 'ON_HOLD',
  paid: 'DELIVERED',
  'paid-return': 'RETURNED',
  exchanged: 'PARTIALLY_DELIVERED',
  'return-in-transit': 'RETURN_IN_TRANSIT',
  'returned-to-merchant': 'RETURNED',
}

/** Lowercases and collapses spaces/underscores so `In Transit` matches `in-transit`. */
function key(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

export function mapSteadfastStatus(raw: string): CourierShipmentStatus {
  // Steadfast writes its statuses with underscores; try that spelling first so
  // `partial_delivered` is not mangled into a miss by the dash normalisation.
  const direct = STEADFAST_STATUS[raw.trim().toLowerCase()]
  if (direct) return direct

  const normalised = key(raw).replace(/-/g, '_')
  return STEADFAST_STATUS[normalised] ?? 'UNKNOWN'
}

export function mapPathaoEvent(raw: string): CourierShipmentStatus {
  return PATHAO_EVENT[key(raw)] ?? 'UNKNOWN'
}

export function mapPathaoSlug(raw: string): CourierShipmentStatus {
  const slug = key(raw)
  // The info endpoint sometimes returns the full event name rather than the
  // bare slug, so fall through to the event table before giving up.
  return PATHAO_SLUG[slug] ?? PATHAO_EVENT[slug] ?? 'UNKNOWN'
}

/**
 * The order state a parcel status implies.
 *
 * An order can hold several parcels in principle, so this is a per-shipment
 * opinion that the dispatch service reconciles across all of an order's
 * shipments — it does not write the order state by itself.
 *
 * Returns null for statuses that say nothing about the order as a whole:
 * PENDING is a row we created and have not sent, and UNKNOWN is precisely the
 * case where guessing is wrong.
 */
export function workflowStateFor(
  status: CourierShipmentStatus
): OrderWorkflowState | null {
  switch (status) {
    case 'SUBMITTED':
    case 'PICKUP_PENDING':
    case 'PICKED_UP':
      return 'DISPATCHED'
    case 'IN_TRANSIT':
    case 'ON_HOLD':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'PARTIALLY_DELIVERED':
      return 'PARTIALLY_DELIVERED'
    case 'RETURN_IN_TRANSIT':
    case 'RETURNED':
      return 'RETURNED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'DELIVERY_FAILED':
      return 'FAILED'
    case 'PENDING':
    case 'UNKNOWN':
      return null
  }
}

/**
 * The states a person is allowed to assert by hand.
 *
 * Everything a courier reports is derived — a webhook says the parcel moved and
 * the order follows it. But plenty of orders never touch a courier: the shop's
 * own rider takes them across town, the customer collects at the counter, or
 * the parcel goes out with a local service that has no API to call back. Those
 * orders still have to be tracked, so the same ladder is writable by a merchant.
 *
 * PENDING and FRAUD_REVIEW are missing because they are screening outcomes
 * rather than delivery facts — putting an order back into review is asking for
 * a re-check, which has its own button. CANCELLED is missing because cancelling
 * returns stock and closes the order, which is the cancel flow's job and not
 * something to reach by way of a status dropdown.
 */
export const MANUAL_WORKFLOW_STATES = [
  'PROCESSING',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'RETURNED',
  'FAILED',
] as const satisfies readonly OrderWorkflowState[]

export type ManualWorkflowState = (typeof MANUAL_WORKFLOW_STATES)[number]

/** Guards the server action, which is a public endpoint like any other. */
export function isManualWorkflowState(
  value: unknown
): value is ManualWorkflowState {
  return (MANUAL_WORKFLOW_STATES as readonly unknown[]).includes(value)
}

/**
 * The parcel status an order state implies — `workflowStateFor` backwards.
 *
 * Only needed when a merchant corrects an order that *also* has a consignment.
 * The order's state is derived from its parcels, so a correction written to the
 * order alone survives until the next reconciliation sweep and no longer;
 * writing it onto the parcel as well is what makes it stick.
 *
 * Deliberately not total. PROCESSING describes an order nobody has picked up
 * yet, and there is no parcel status for "still on the shelf".
 */
export function shipmentStatusFor(
  state: OrderWorkflowState
): CourierShipmentStatus | null {
  switch (state) {
    case 'DISPATCHED':
      return 'PICKED_UP'
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'PARTIALLY_DELIVERED':
      return 'PARTIALLY_DELIVERED'
    case 'RETURNED':
      return 'RETURNED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'FAILED':
      return 'DELIVERY_FAILED'
    case 'PENDING':
    case 'FRAUD_REVIEW':
    case 'PROCESSING':
      return null
  }
}

/**
 * Whether a parcel has stopped moving.
 *
 * Used by the reconciliation sweep to stop polling: a delivered or returned
 * parcel will not change again, and continuing to ask about it wastes the
 * courier's rate limit on parcels that are still in play.
 */
export function isTerminal(status: CourierShipmentStatus): boolean {
  return (
    status === 'DELIVERED' ||
    status === 'RETURNED' ||
    status === 'CANCELLED' ||
    status === 'PARTIALLY_DELIVERED'
  )
}

/**
 * The old `fulfillmentStatus` string, derived rather than stored.
 *
 * The concept is gone from the platform: stock moves when a courier takes the
 * parcel, and the order's own workflow state is the single answer to "where is
 * this". But the value was published by the v1 order API and the order
 * webhooks, and integrations built against those are outside this repository
 * and cannot be migrated in step with it.
 *
 * So it is computed on the way out and never persisted. Nothing inside the
 * platform reads it, which is what stops it from quietly becoming a second
 * source of truth that drifts from the first.
 */
export function legacyFulfillmentStatus(
  state: OrderWorkflowState
): 'unfulfilled' | 'fulfilled' | 'restocked' {
  switch (state) {
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
    case 'DELIVERED':
    case 'PARTIALLY_DELIVERED':
      return 'fulfilled'
    case 'RETURNED':
    case 'CANCELLED':
      return 'restocked'
    case 'PENDING':
    case 'FRAUD_REVIEW':
    case 'PROCESSING':
    case 'FAILED':
      return 'unfulfilled'
  }
}

/** Merchant-facing wording for a parcel state, used in UI and in timelines. */
export const SHIPMENT_STATUS_LABEL: Record<CourierShipmentStatus, string> = {
  PENDING: 'Not sent yet',
  SUBMITTED: 'Accepted by courier',
  PICKUP_PENDING: 'Awaiting pickup',
  PICKED_UP: 'Received by courier',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  PARTIALLY_DELIVERED: 'Partially delivered',
  ON_HOLD: 'On hold',
  RETURN_IN_TRANSIT: 'Returning',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
  DELIVERY_FAILED: 'Delivery failed',
  UNKNOWN: 'Unknown',
}

export const WORKFLOW_STATE_LABEL: Record<OrderWorkflowState, string> = {
  PENDING: 'Pending',
  FRAUD_REVIEW: 'Needs review',
  PROCESSING: 'Processing',
  // "Dispatched" describes what the merchant did; this describes where the
  // parcel is, which is what everyone reading the order actually wants to know.
  DISPATCHED: 'Sent to courier',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  PARTIALLY_DELIVERED: 'Partially delivered',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
}
