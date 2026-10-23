import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { getTotals } from '@/server/services/salesAnalyticsService'
import { getCurrencyContext } from '@/server/services/organizationSettingsService'
import { resolveRange } from '@/lib/date-range'
import { orderStatus } from '@/lib/order-status'
import type { OrderWorkflowState } from '@/generated/prisma/enums'

/**
 * The states where an order is still waiting on a person: being screened,
 * held by the fraud check, or approved and not yet with a courier. The same
 * three as the order list's "Needs action" view, so the count on the rail and
 * the list it opens agree.
 */
const NEEDS_ACTION: OrderWorkflowState[] = [
  'PENDING',
  'FRAUD_REVIEW',
  'PROCESSING',
]

/**
 * The number on the rail's Orders entry.
 *
 * Cancelled orders are left out even when the pipeline still says PROCESSING:
 * a cancellation is recorded beside the workflow state rather than in it (see
 * lib/order-status), and a badge that counted orders nobody will ever ship
 * would be a badge people learn to ignore.
 */
export async function countOrdersNeedingAction(
  organizationId: string
): Promise<number> {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.order.count({
    where: {
      organizationId,
      workflowState: { in: NEEDS_ACTION },
      cancelledAt: null,
    },
  })
}

export interface HomeSummary {
  currencyCode: string
  /** What is waiting on the merchant, each one a card that opens the list. */
  attention: {
    review: number
    toShip: number
    failed: number
  }
  today: {
    orders: number
    ordersYesterday: number
    salesCents: number
    collectedCents: number
    visits: number
  }
  /** Delivered as a share of orders that reached an outcome, last 30 days. */
  delivery: {
    rate: number
    settled: number
  }
  latestOrders: {
    id: string
    orderNumber: string
    customer: string
    summary: string
    totalCents: number
    currencyCode: string
    status: OrderWorkflowState
    createdAt: Date
  }[]
  /** Pages ranked by the orders they produced in the last seven days. */
  topPages: {
    id: string
    title: string
    storeId: string
    orders: number
  }[]
  setup: {
    firstStoreId: string | null
    hasStore: boolean
    hasProducts: boolean
    hasCourier: boolean
    hasPublishedPage: boolean
    hasPixel: boolean
  }
}

/**
 * Everything Home shows, in one round of parallel queries.
 *
 * Home is the first screen after sign-in, so it reads only this database: no
 * call here waits on a merchant's own website. Stock is the exception that
 * proves it — for products that live on the merchant's site it can only be
 * known by asking, so Home fetches that separately and streams it in.
 *
 * "Today" and "yesterday" are Dhaka days (lib/date-range), the same days the
 * analytics screen uses, so the two never disagree about what today sold.
 */
export async function getHomeSummary(
  organizationId: string
): Promise<HomeSummary> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const today = resolveRange({ range: 'today' })
  const yesterday = resolveRange({ range: 'yesterday' })
  const lastWeek = resolveRange({ range: 'last_7_days' })
  const lastMonth = resolveRange({ range: 'last_30_days' })

  const live = { organizationId, cancelledAt: null }

  const [
    currency,
    review,
    toShip,
    failed,
    totalsToday,
    ordersYesterday,
    totalsMonth,
    visits,
    latest,
    pageCounts,
    stores,
    localProducts,
    connection,
    couriers,
    publishedPages,
    pixels,
  ] = await Promise.all([
    getCurrencyContext(organizationId),
    prisma.order.count({ where: { ...live, workflowState: 'FRAUD_REVIEW' } }),
    prisma.order.count({ where: { ...live, workflowState: 'PROCESSING' } }),
    prisma.order.count({ where: { ...live, workflowState: 'FAILED' } }),
    getTotals(organizationId, today),
    prisma.order.count({
      where: {
        organizationId,
        createdAt: { gte: yesterday.start ?? undefined, lt: yesterday.end },
      },
    }),
    getTotals(organizationId, lastMonth),
    prisma.pageView.count({
      where: {
        store: { organizationId },
        createdAt: { gte: today.start ?? undefined, lt: today.end },
      },
    }),
    prisma.order.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        totalCents: true,
        currencyCode: true,
        workflowState: true,
        workflowUpdatedAt: true,
        cancelledAt: true,
        createdAt: true,
        phone: true,
        email: true,
        customer: { select: { firstName: true, lastName: true } },
        lines: {
          select: { title: true, quantity: true },
          orderBy: { id: 'asc' },
        },
      },
    }),
    prisma.order.groupBy({
      by: ['pageId'],
      where: {
        ...live,
        pageId: { not: null },
        createdAt: { gte: lastWeek.start ?? undefined, lt: lastWeek.end },
      },
      _count: { _all: true },
      orderBy: { _count: { pageId: 'desc' } },
      take: 3,
    }),
    prisma.store.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: 1,
    }),
    prisma.product.count({ where: { organizationId } }),
    prisma.catalogConnection.count({ where: { organizationId } }),
    prisma.courierConfig.count({ where: { organizationId, isEnabled: true } }),
    prisma.page.count({
      where: {
        store: { organizationId },
        status: 'PUBLISHED',
        role: 'STANDARD',
      },
    }),
    prisma.storeIntegrationConfig.count({
      where: {
        store: { organizationId },
        OR: [
          { metaPixelId: { not: null } },
          { gaMeasurementId: { not: null } },
        ],
      },
    }),
  ])

  const pageIds = pageCounts.flatMap((row) => (row.pageId ? [row.pageId] : []))
  const pages = pageIds.length
    ? await prisma.page.findMany({
        where: { id: { in: pageIds } },
        select: { id: true, title: true, storeId: true },
      })
    : []

  return {
    currencyCode: currency.currencyCode,
    attention: { review, toShip, failed },
    today: {
      orders: totalsToday.orders,
      ordersYesterday,
      salesCents: totalsToday.netSalesCents,
      collectedCents: totalsToday.collectedCents,
      visits,
    },
    delivery: {
      rate: totalsMonth.deliveryRate,
      settled: totalsMonth.deliveredOrders + totalsMonth.cancelledOrders,
    },
    latestOrders: latest.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customer:
        [order.customer?.firstName, order.customer?.lastName]
          .filter(Boolean)
          .join(' ') ||
        order.phone ||
        order.email ||
        'Guest',
      summary: summarise(order.lines),
      totalCents: order.totalCents,
      currencyCode: order.currencyCode,
      status: orderStatus(order),
      createdAt: order.createdAt,
    })),
    topPages: pageCounts.flatMap((row) => {
      const page = pages.find((p) => p.id === row.pageId)
      return page
        ? [
            {
              id: page.id,
              title: page.title,
              storeId: page.storeId,
              orders: row._count._all,
            },
          ]
        : []
    }),
    setup: {
      firstStoreId: stores[0]?.id ?? null,
      hasStore: stores.length > 0,
      hasProducts: localProducts > 0 || connection > 0,
      hasCourier: couriers > 0,
      hasPublishedPage: publishedPages > 0,
      hasPixel: pixels > 0,
    },
  }
}

/** "Cotton Panjabi × 2 + 1 more" — enough to recognise an order by. */
function summarise(lines: { title: string; quantity: number }[]): string {
  const [first, ...rest] = lines
  if (!first) return 'No items'
  const head =
    first.quantity > 1 ? `${first.title} × ${first.quantity}` : first.title
  return rest.length ? `${head} + ${rest.length} more` : head
}
