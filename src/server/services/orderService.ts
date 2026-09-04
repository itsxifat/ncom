import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess, requireHumanOrgAccess } from '@/server/auth/rbac'
import { returnToStock } from './inventoryService'
import { legacyFulfillmentStatus } from '@/server/courier/statusMap'
import { emitWebhook } from './webhookService'
import { clampNonNegative, formatMoney } from '@/lib/money'
import { isOrderCancelled, orderStatus } from '@/lib/order-status'
import type { WebhookTopic } from '@/generated/prisma/client'
import type { OrderWorkflowState } from '@/generated/prisma/enums'

/**
 * Order management: reading, cancelling, returning and refunding.
 *
 * Orders are append-only where money is concerned. Nothing here rewrites
 * subtotalCents, taxTotalCents or a line's unitPriceCents — those record what
 * was actually agreed and charged. Corrections happen by adding Refund and
 * Transaction rows, so the history of an order always reconstructs from its
 * ledger. The only mutable fields are status flags, returned/refunded
 * counters, and merchant annotations.
 */

/**
 * What a line needs to show a picture: one column, no join.
 *
 * Kept as an exported fragment so the call sites that used to spread it — the
 * order screen, the courier payload, the packing label — read the same as they
 * did, and so the next person to add one does not reinvent a join to a
 * catalogue that is no longer here.
 *
 * The picture is the variant's own if it had one, else the product's first,
 * decided at the moment of sale. Variant first because that is the whole point
 * of a variant image: an order for the red one must not show a photo of the
 * blue one, which is how a packer picks the wrong thing off the shelf.
 */
export const ORDER_LINE_IMAGE_SELECT = { imageUrl: true } as const

export function orderLineImageUrl(line: {
  imageUrl?: string | null
}): string | null {
  return line.imageUrl ?? null
}

const ORDER_INCLUDE = {
  lines: true,
  transactions: { orderBy: { createdAt: 'asc' as const } },
  returns: { include: { lines: true } },
  refunds: { include: { lines: true } },
  events: { orderBy: { createdAt: 'desc' as const } },
  customer: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
  store: { select: { id: true, name: true, subdomain: true } },
  page: { select: { id: true, title: true, slug: true } },
} as const

export async function listOrders(
  organizationId: string,
  options: {
    search?: string
    financialStatus?:
      | 'PENDING'
      | 'AUTHORIZED'
      | 'PARTIALLY_PAID'
      | 'PAID'
      | 'PARTIALLY_REFUNDED'
      | 'REFUNDED'
      | 'VOIDED'
    /** Where the order sits in the courier pipeline — see OrderWorkflowState. */
    workflowState?: OrderWorkflowState
    /**
     * Several states at once, for views defined by a job rather than by one
     * status — "everything still to go out" is four states, and asking the
     * caller to make four queries and merge them is how a list ends up
     * paginated wrongly.
     */
    workflowStateIn?: OrderWorkflowState[]
    /**
     * One storefront's orders. Filtered on the order's own `storeId` rather
     * than through the relation, so it keeps meaning "sold by this site" and
     * does not quietly hide orders whose site was deleted.
     */
    storeId?: string
    take?: number
    skip?: number
  } = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const where = {
    organizationId,
    // Deliberately not filtered by `store: { organizationId }`. `storeId` is
    // nullable and nulls out when a storefront is deleted, and a relation
    // filter on a nullable to-one relation excludes rows where it is null — so
    // that clause silently hid every order whose landing page had since been
    // taken down. An order is a financial record of the organisation;
    // `organizationId` above is what scopes it, and it is never null.
    ...(options.financialStatus
      ? { financialStatus: options.financialStatus }
      : {}),
    ...(options.workflowState ? { workflowState: options.workflowState } : {}),
    ...(options.workflowStateIn?.length
      ? { workflowState: { in: options.workflowStateIn } }
      : {}),
    ...(options.storeId ? { storeId: options.storeId } : {}),
    ...(options.search
      ? {
          OR: [
            {
              orderNumber: {
                contains: options.search,
                mode: 'insensitive' as const,
              },
            },
            {
              email: { contains: options.search, mode: 'insensitive' as const },
            },
            // Phone is how a cash-on-delivery order is identified. The customer
            // rings about "my order" and gives a number, not an order number —
            // and frequently there is no email on the order at all, so
            // searching without this means the merchant cannot find them.
            {
              phone: { contains: options.search, mode: 'insensitive' as const },
            },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        lines: { select: { id: true, quantity: true } },
        customer: { select: { firstName: true, lastName: true, email: true } },
        // Attribution: one catalogue can be sold from several landing pages,
        // so the merchant needs to see which one produced each order — and
        // which offer on it, since a page runs several bundles at once.
        store: { select: { id: true, name: true, subdomain: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: options.take ?? 50,
      skip: options.skip ?? 0,
    }),
    prisma.order.count({ where }),
  ])

  return { items, total }
}

/**
 * Tells subscribers an order moved.
 *
 * Reloads the order rather than passing along whatever the caller happened to
 * have, so every order event carries the same complete object regardless of
 * which operation produced it — a receiver should not have to handle
 * `order.fulfilled` being shaped differently from `order.cancelled`.
 *
 * Lines carry the variant id and quantity because the most common reason to
 * subscribe to order events is to move the same stock in another system, and
 * making that receiver call back for the lines defeats the point.
 */
export async function emitOrderWebhook(
  organizationId: string,
  orderId: string,
  topic: WebhookTopic
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      orderNumber: true,
      email: true,
      phone: true,
      financialStatus: true,
      workflowState: true,
      workflowUpdatedAt: true,
      stockConsumedAt: true,
      currencyCode: true,
      subtotalCents: true,
      discountTotalCents: true,
      shippingTotalCents: true,
      taxTotalCents: true,
      totalCents: true,
      cancelledAt: true,
      createdAt: true,
      lines: {
        select: {
          id: true,
          productId: true,
          variantId: true,
          title: true,
          variantTitle: true,
          sku: true,
          quantity: true,
          unitPriceCents: true,
          totalCents: true,
        },
      },
    },
  })
  if (!order) return

  await emitWebhook(organizationId, topic, {
    id: order.id,
    orderNumber: order.orderNumber,
    email: order.email,
    phone: order.phone,
    financialStatus: order.financialStatus.toLowerCase(),
    // Derived for compatibility only — see legacyFulfillmentStatus. Read from
    // the merged status so a cancelled order is reported as restocked to a
    // subscriber even if the two columns were written apart.
    fulfillmentStatus: legacyFulfillmentStatus(orderStatus(order)),
    currencyCode: order.currencyCode,
    subtotalCents: order.subtotalCents,
    discountTotalCents: order.discountTotalCents,
    shippingTotalCents: order.shippingTotalCents,
    taxTotalCents: order.taxTotalCents,
    totalCents: order.totalCents,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      variantId: line.variantId,
      title: line.title,
      variantTitle: line.variantTitle,
      sku: line.sku,
      quantity: line.quantity,
      fulfilledQuantity: order.stockConsumedAt ? line.quantity : 0,
      unitPriceCents: line.unitPriceCents,
      totalCents: line.totalCents,
    })),
  })
}

export async function getOrder(organizationId: string, orderId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: ORDER_INCLUDE,
  })
  if (!order) throw new Error('Order not found')

  return order
}

/**
 * Cancels an order and returns its stock.
 *
 * Refunding money is deliberately a separate step: cancelling is an
 * operational decision the merchant makes immediately, while returning funds
 * depends on the payment provider and may fail. Coupling them would leave
 * orders stuck half-cancelled when a gateway call errors.
 */
export async function cancelOrder(
  organizationId: string,
  orderId: string,
  input: {
    reason: 'CUSTOMER' | 'FRAUD' | 'INVENTORY' | 'DECLINED' | 'OTHER'
    restock?: boolean
  }
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: { lines: true },
  })
  if (!order) throw new Error('Order not found')
  if (isOrderCancelled(order))
    throw new Error('This order is already cancelled')

  const now = new Date()

  // Outside the transaction, and before it: this is a call to the merchant's
  // own website, and a Postgres transaction must never be held open across one.
  // A cancellation that saves after the stock went back is the safe order of
  // the two — the alternative leaves units held for an order nobody can see.
  if (input.restock !== false && !order.stockConsumedAt) {
    // Only units that never shipped come back here. Goods a courier already
    // collected are gone until physically returned, which is handled by the
    // return flow instead.
    await returnToStock(
      organizationId,
      orderId,
      order.lines
        .filter((line) => line.variantId !== null)
        .map((line) => ({
          variantId: line.variantId!,
          quantity: line.quantity,
        })),
      { orderId }
    )
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'order_cancelled',
        message: `Order cancelled (${input.reason.toLowerCase()})`,
        actorUserId: session.user.id,
      },
    })

    return tx.order.update({
      where: { id: orderId },
      data: {
        cancelledAt: now,
        cancelReason: input.reason,
        // The pipeline moves with the cancellation. It used to be left where
        // it was, so the order book went on showing "Pending" beside an order
        // the detail page called cancelled — one order, two answers. There is
        // one status now; `cancelledAt` says when and why it got there.
        workflowState: 'CANCELLED',
        workflowUpdatedAt: now,
        ...(input.restock !== false && !order.stockConsumedAt
          ? { stockRestoredAt: now }
          : {}),
      },
    })
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_CANCELLED')

  return cancelled
}

/**
 * Records a refund.
 *
 * Refundable amounts are bounded by what was actually paid minus what has
 * already been returned, so repeated calls cannot refund more than was taken.
 * The financial status is then derived from the running totals rather than
 * being asserted.
 */
export async function refundOrder(
  organizationId: string,
  orderId: string,
  input: {
    lines: { orderLineId: string; quantity: number }[]
    shippingCents?: number
    reason?: string
    note?: string
    restock?: boolean
  }
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'ADMIN')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: { lines: true },
  })
  if (!order) throw new Error('Order not found')

  const lineById = new Map(order.lines.map((line) => [line.id, line]))

  let goodsCents = 0
  let taxCents = 0

  for (const requested of input.lines) {
    const line = lineById.get(requested.orderLineId)
    if (!line) throw new Error('That line is not part of this order')

    const remaining = line.quantity - line.refundedQuantity
    if (requested.quantity < 1 || requested.quantity > remaining) {
      throw new Error(
        `Cannot refund ${requested.quantity} of "${line.title}" — ${remaining} remain`
      )
    }

    // Refund the discounted unit price, not the list price: refunding what the
    // customer never paid hands back money the store never received.
    const netLineTotal = clampNonNegative(
      line.unitPriceCents * line.quantity - line.totalDiscountCents
    )
    const perUnit = Math.round(netLineTotal / line.quantity)
    const perUnitTax = Math.round(line.taxTotalCents / line.quantity)

    goodsCents += perUnit * requested.quantity
    taxCents += perUnitTax * requested.quantity
  }

  const shippingCents = input.shippingCents ?? 0
  const amountCents = goodsCents + taxCents + shippingCents

  const refundable = order.paidTotalCents - order.refundedTotalCents
  if (amountCents > refundable) {
    throw new Error(
      `Cannot refund more than the ${refundable} remaining on this order`
    )
  }

  const refunded = await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderId,
        amountCents,
        shippingCents,
        taxCents,
        reason: input.reason ?? null,
        note: input.note ?? null,
        restock: input.restock ?? true,
        actorUserId: session.user.id,
        lines: {
          create: input.lines.map((requested) => {
            const line = lineById.get(requested.orderLineId)!
            const netLineTotal = clampNonNegative(
              line.unitPriceCents * line.quantity - line.totalDiscountCents
            )
            const perUnit = Math.round(netLineTotal / line.quantity)
            return {
              orderLineId: requested.orderLineId,
              quantity: requested.quantity,
              amountCents: perUnit * requested.quantity,
            }
          }),
        },
      },
      select: { id: true },
    })

    for (const requested of input.lines) {
      await tx.orderLine.update({
        where: { id: requested.orderLineId },
        data: { refundedQuantity: { increment: requested.quantity } },
      })
    }

    await tx.transaction.create({
      data: {
        orderId,
        kind: 'REFUND',
        status: 'SUCCESS',
        // Refunds follow the money back along whichever rail took it.
        provider:
          (
            await tx.transaction.findFirst({
              where: { orderId, kind: { in: ['SALE', 'CAPTURE'] } },
              select: { provider: true },
            })
          )?.provider ?? 'MANUAL',
        amountCents,
        currencyCode: order.currencyCode,
      },
    })

    const refundedTotal = order.refundedTotalCents + amountCents

    await tx.order.update({
      where: { id: orderId },
      data: {
        refundedTotalCents: refundedTotal,
        financialStatus:
          refundedTotal >= order.paidTotalCents && order.paidTotalCents > 0
            ? 'REFUNDED'
            : refundedTotal > 0
              ? 'PARTIALLY_REFUNDED'
              : order.financialStatus,
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'refund_created',
        // Formatted, not raw minor units: this line used to read
        // "Refunded 50000 BDT" for a ৳500 refund.
        message: `Refunded ${formatMoney(amountCents, order.currencyCode)}`,
        actorUserId: session.user.id,
      },
    })

    return refund
  })

  // After the refund is recorded, and outside its transaction, for the same
  // reason the cancellation path is: putting the goods back is a request to
  // someone else's server, and the refund must not depend on it answering.
  if (input.restock ?? true) {
    await returnToStock(
      organizationId,
      refunded.id,
      input.lines
        .map((requested) => ({
          variantId: lineById.get(requested.orderLineId)?.variantId ?? '',
          quantity: requested.quantity,
        }))
        .filter((line) => line.variantId !== ''),
      { orderId }
    )
  }

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return refunded
}

/** Records an offline payment against a pending order (bank transfer, COD). */
export async function markOrderPaid(organizationId: string, orderId: string) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      totalCents: true,
      paidTotalCents: true,
      currencyCode: true,
    },
  })
  if (!order) throw new Error('Order not found')

  const outstanding = order.totalCents - order.paidTotalCents
  if (outstanding <= 0) throw new Error('This order is already paid')

  const paid = await prisma.$transaction(async (tx) => {
    await tx.transaction.create({
      data: {
        orderId,
        kind: 'SALE',
        status: 'SUCCESS',
        provider: 'MANUAL',
        amountCents: outstanding,
        currencyCode: order.currencyCode,
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'payment_recorded',
        message: 'Payment recorded manually',
        actorUserId: session.user.id,
      },
    })

    return tx.order.update({
      where: { id: orderId },
      data: {
        paidTotalCents: order.totalCents,
        financialStatus: 'PAID',
      },
    })
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return paid
}

export async function addOrderNote(
  organizationId: string,
  orderId: string,
  note: string
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true },
  })
  if (!order) throw new Error('Order not found')

  await prisma.orderEvent.create({
    data: {
      orderId,
      type: 'note_added',
      message: note,
      actorUserId: session.user.id,
    },
  })

  return prisma.order.update({ where: { id: orderId }, data: { note } })
}
