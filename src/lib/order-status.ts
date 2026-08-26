/**
 * One status for an order, out of the two the database keeps.
 *
 * `workflowState` is where the parcel is; `cancelledAt` is the moment someone
 * stopped the order. They are separate columns because a cancellation is a
 * financial fact with a time and a reason on it, and the pipeline is a ladder —
 * but they are not two statuses, and treating them as such is how the order
 * list came to show "Pending" for an order the detail page called cancelled.
 *
 * Every screen asks this function instead of reading either column, so the list
 * row, the detail header, the label queue and the customer's tracking page all
 * say the same word. The writers keep the two columns in step (see
 * `cancelOrder` and `syncOrderFromShipments`); this is what makes the *reads*
 * agree anyway — on rows written before they did, and on anything a future
 * writer forgets.
 *
 * Client-safe: no database, no server imports. The list renders it.
 */

import type { OrderWorkflowState } from '@/generated/prisma/enums'

/** What any caller must be able to hand over — the two columns and their clock. */
export interface OrderStatusFacts {
  workflowState: OrderWorkflowState
  /** When the order was cancelled, if it was. */
  cancelledAt: Date | string | null
  /**
   * When `workflowState` was last written. Optional because the guards that
   * only ask "is this cancelled" do not need it: without a timestamp to beat, a
   * cancellation stands.
   */
  workflowUpdatedAt?: Date | string | null
}

function at(value: Date | string | null | undefined): number | null {
  if (value == null) return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * The status to show, which is whichever of the two was written last.
 *
 * An order cancelled after the courier last moved it reads as cancelled; one
 * whose parcel kept moving after a cancellation reads as wherever the parcel
 * is. Both columns carry a timestamp, so "latest" is a fact rather than a
 * precedence rule someone has to remember.
 */
export function orderStatus(order: OrderStatusFacts): OrderWorkflowState {
  if (order.workflowState === 'CANCELLED') return 'CANCELLED'

  const cancelled = at(order.cancelledAt)
  if (cancelled === null) return order.workflowState

  const moved = at(order.workflowUpdatedAt)
  return moved !== null && moved > cancelled ? order.workflowState : 'CANCELLED'
}

/**
 * Whether the order is stopped — the one question the guards ask.
 *
 * Written in terms of `orderStatus` so a courier-cancelled parcel and a
 * merchant-cancelled order close the same doors: no dispatch, no edit, no
 * second cancellation.
 */
export function isOrderCancelled(order: OrderStatusFacts): boolean {
  return orderStatus(order) === 'CANCELLED'
}
