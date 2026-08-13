import { apiOk, withApiKey } from '@/server/api/context'
import { getOrder } from '@/server/services/orderService'

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
        fulfillmentStatus: order.fulfillmentStatus.toLowerCase(),
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
