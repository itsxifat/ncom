import 'server-only'
import { prisma } from '@/server/db/client'
import { requireHumanOrgAccess } from '@/server/auth/rbac'
import { returnToStock } from './inventoryService'
import { emitOrderWebhook } from './orderService'

/**
 * Returns — whole, and partial.
 *
 * The case this exists for: a rider reaches the door with five shirts, the
 * customer takes three and refuses two, and hands over the money for three. No
 * refund happened. Nothing was ever collected for the two that came back. What
 * changed is what the customer owed and what is on the shelf.
 *
 * Filing that as a refund — which is what the platform did before — reports
 * money moving out that never moved in, and every revenue figure downstream
 * inherits it. So a return is its own record, and `Refund` is left to mean the
 * one thing it should: money sent back to someone who paid.
 *
 * The totals maths follows the same rule Elysium settled on, and it is worth
 * stating because it is not obvious: the order's discount is re-applied in
 * proportion to what the customer kept. A ৳200-off coupon on a ৳1,000 order
 * where half comes back is ৳100 off, not ৳200 — otherwise refusing items
 * would let a buyer keep the whole discount against a smaller basket, and on a
 * deep enough discount the merchant would owe them money.
 */

export interface RecordReturnInput {
  /** Which lines came back, and how many of each. */
  lines: { orderLineId: string; quantity: number }[]
  /** Waive the delivery charge on this return. */
  waiveDeliveryCharge?: boolean
  /** Whether the goods are sellable again. Damaged returns are not. */
  restock?: boolean
  note?: string
}

export async function recordOrderReturn(
  organizationId: string,
  orderId: string,
  input: RecordReturnInput
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      storeId: true,
      subtotalCents: true,
      discountTotalCents: true,
      shippingTotalCents: true,
      totalCents: true,
      paidTotalCents: true,
      returnedAmountCents: true,
      stockConsumedAt: true,
      lines: {
        select: {
          id: true,
          title: true,
          variantId: true,
          quantity: true,
          returnedQuantity: true,
          unitPriceCents: true,
        },
      },
    },
  })
  if (!order) throw new Error('Order not found')

  const lineById = new Map(order.lines.map((line) => [line.id, line]))

  // Validated up front, before anything is written: a return that is half
  // applied is worse than one that is refused, because the totals and the
  // stock would disagree with each other and with the parcel.
  const returning: { line: (typeof order.lines)[number]; quantity: number }[] =
    []

  for (const requested of input.lines) {
    const line = lineById.get(requested.orderLineId)
    if (!line) throw new Error('That line is not part of this order')

    const remaining = line.quantity - line.returnedQuantity
    if (requested.quantity < 1) continue
    if (requested.quantity > remaining) {
      throw new Error(
        `Cannot return ${requested.quantity} of "${line.title}" — ${remaining} of that line ${remaining === 1 ? 'is' : 'are'} still with the customer`
      )
    }
    returning.push({ line, quantity: requested.quantity })
  }

  if (returning.length === 0) throw new Error('Nothing was selected to return')

  const waived = input.waiveDeliveryCharge ?? false
  const restock = input.restock ?? true

  // What the customer keeps, priced at what they were charged.
  const returnedByLine = new Map(
    returning.map((entry) => [entry.line.id, entry.quantity])
  )
  const keptSubtotalCents = order.lines.reduce((sum, line) => {
    const returnedNow = returnedByLine.get(line.id) ?? 0
    const kept = line.quantity - line.returnedQuantity - returnedNow
    return sum + kept * line.unitPriceCents
  }, 0)

  // The discount, scaled to the kept goods. Integer maths throughout: rounding
  // once here is exact, where a float would leave a stray paisa on the order.
  const effectiveDiscountCents =
    order.subtotalCents > 0
      ? Math.round(
          (order.discountTotalCents * keptSubtotalCents) / order.subtotalCents
        )
      : 0

  const newTotalCents = Math.max(
    0,
    keptSubtotalCents -
      effectiveDiscountCents +
      (waived ? 0 : order.shippingTotalCents)
  )

  // What this return took off the bill. Never negative: a return cannot
  // increase what is owed.
  const reductionCents = Math.max(0, order.totalCents - newTotalCents)

  // Only goods that actually left can come back. A return recorded before the
  // courier ever collected would otherwise ask the merchant's site to invent
  // stock that never moved.
  const returnable =
    restock && order.stockConsumedAt
      ? returning
          .filter((entry) => entry.line.variantId)
          .map((entry) => ({
            variantId: entry.line.variantId!,
            quantity: entry.quantity,
          }))
      : []

  const recorded = await prisma.$transaction(async (tx) => {
    const orderReturn = await tx.orderReturn.create({
      data: {
        orderId,
        refundAmountCents: reductionCents,
        deliveryChargeWaived: waived,
        restocked: restock,
        note: input.note?.trim() || null,
        actorUserId: session.user.id,
        actorName: session.user.name ?? session.user.email ?? null,
        lines: {
          create: returning.map((entry) => ({
            orderLineId: entry.line.id,
            quantity: entry.quantity,
          })),
        },
      },
      select: { id: true },
    })

    for (const entry of returning) {
      await tx.orderLine.update({
        where: { id: entry.line.id },
        data: { returnedQuantity: { increment: entry.quantity } },
      })
    }

    const updatedLines = await tx.orderLine.findMany({
      where: { orderId },
      select: { quantity: true, returnedQuantity: true },
    })
    const everythingBack = updatedLines.every(
      (line) => line.returnedQuantity >= line.quantity
    )

    await tx.order.update({
      where: { id: orderId },
      data: {
        totalCents: newTotalCents,
        returnedAmountCents: order.returnedAmountCents + reductionCents,
        deliveryChargeWaived: waived,
        // The parcel's own state, restated from what came back. A partial
        // return is its own outcome and must not round to either neighbour.
        workflowState: everythingBack ? 'RETURNED' : 'PARTIALLY_DELIVERED',
        workflowUpdatedAt: new Date(),
        // A cash-on-delivery order that is now fully paid-down reads PAID; one
        // still owing reads partially paid. Recomputed rather than assumed,
        // because the total just moved underneath it.
        financialStatus:
          order.paidTotalCents >= newTotalCents
            ? newTotalCents === 0
              ? 'PENDING'
              : 'PAID'
            : order.paidTotalCents > 0
              ? 'PARTIALLY_PAID'
              : 'PENDING',
        ...(everythingBack ? { stockRestoredAt: new Date() } : {}),
      },
    })

    const units = returning.reduce((sum, entry) => sum + entry.quantity, 0)
    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'order_returned',
        message: `${units} unit${units === 1 ? '' : 's'} returned${waived ? ', delivery waived' : ''}`,
        actorUserId: session.user.id,
        metadata: {
          returnId: orderReturn.id,
          units,
          reductionCents,
          restocked: restock,
        },
      },
    })

    return orderReturn
  })

  // After the return is recorded, and outside its transaction: telling the
  // merchant's site the units are sellable again is a call across the internet,
  // and a return that a warehouse has already accepted must not fail because
  // their server was slow.
  await returnToStock(organizationId, recorded.id, returnable, { orderId })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return recorded
}
