import { apiOk, withApiKey } from '@/server/api/context'
import { getOrder } from '@/server/services/orderService'
import { legacyFulfillmentStatus } from '@/server/courier/statusMap'
import { orderStatus } from '@/lib/order-status'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  return withApiKey('ORDERS_READ', async ({ organizationId }) => {
    const { orderId } = await params
    const order = await getOrder(organizationId, orderId)

    return apiOk({
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        email: order.email,
        phone: order.phone,
        financialStatus: order.financialStatus.toLowerCase(),
        // Derived, not stored — kept so integrations built against v1 keep
        // working now that fulfilment is not a concept in the platform.
        fulfillmentStatus: legacyFulfillmentStatus(orderStatus(order)),
        currencyCode: order.currencyCode,
        subtotalCents: order.subtotalCents,
        discountTotalCents: order.discountTotalCents,
        shippingTotalCents: order.shippingTotalCents,
        taxTotalCents: order.taxTotalCents,
        paidTotalCents: order.paidTotalCents,
        refundedTotalCents: order.refundedTotalCents,
        totalCents: order.totalCents,
        // Every descriptive field on a line is a snapshot taken at order time,
        // so this stays truthful about what was actually sold even after the
        // product has been renamed, repriced or deleted.
        lines: order.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          variantId: line.variantId,
          title: line.title,
          variantTitle: line.variantTitle,
          sku: line.sku,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
        })),
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
    })
  })
}

export const runtime = 'nodejs'
