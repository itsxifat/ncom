import { apiOk, readPaging, withApiKey } from '@/server/api/context'
import { listOrders } from '@/server/services/orderService'

/**
 * `GET /api/v1/orders` — orders, newest first.
 *
 * Read-only in v1. Order mutations here — refunds, fulfilments, cancellations —
 * are recorded against the person who performed them and appear in the order's
 * event timeline; an API key is not a person, so exposing them would either put
 * a fiction in that timeline or leave it blank on exactly the events where
 * "who did this" matters most. Reading orders and receiving `order.created`
 * webhooks covers what an external system needs to stay in step.
 */
export async function GET(request: Request) {
  return withApiKey('ORDERS_READ', async ({ organizationId }) => {
    const url = new URL(request.url)
    const { limit, page, skip } = readPaging(request)

    const { items, total } = await listOrders(organizationId, {
      search: url.searchParams.get('search') ?? undefined,
      take: limit,
      skip,
    })

    return apiOk({
      data: items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        email: order.email,
        phone: order.phone,
        financialStatus: order.financialStatus.toLowerCase(),
        fulfillmentStatus: order.fulfillmentStatus.toLowerCase(),
        currencyCode: order.currencyCode,
        subtotalCents: order.subtotalCents,
        totalCents: order.totalCents,
        lineCount: order.lines.length,
        itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
        customer: order.customer
          ? {
              firstName: order.customer.firstName,
              lastName: order.customer.lastName,
              email: order.customer.email,
            }
          : null,
        store: order.store
          ? { id: order.store.id, name: order.store.name }
          : null,
        createdAt: order.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, hasMore: skip + items.length < total },
    })
  })
}

export const runtime = 'nodejs'
