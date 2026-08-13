import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  bucketKeys,
  pickGranularity,
  previousRange,
  REPORTING_TIMEZONE,
  type DateWindow,
  type Granularity,
} from '@/lib/date-range'

/**
 * Sales analytics.
 *
 * ── What the money numbers mean ──────────────────────────────────────────
 *
 * This is a cash-on-delivery market, so "revenue" has to be split by how
 * certain it is. An order worth ৳3,000 placed this morning is not the same
 * asset as one delivered and paid for last week, and a report that adds them
 * together tells a merchant they can afford stock they cannot.
 *
 *   grossSales      goods ordered, before discount and shipping (subtotal)
 *   netSales        what customers were actually invoiced (total)
 *   collected       money genuinely received — the payments ledger, not a guess
 *   inFlight        invoiced but not yet collected on live orders
 *   cancelledValue  invoiced on orders that were cancelled — lost
 *   refunded        money handed back
 *
 * Cancelled orders are excluded from grossSales, netSales, units and AOV: a
 * cancelled COD parcel was never a sale. `orders` still counts them, because
 * "how many orders came in" and "how many turned into money" are both real
 * questions and the gap between them is the interesting one.
 *
 * `collected` reads the Transaction ledger rather than assuming a delivered
 * order was paid. In a COD store those usually agree — the courier settles on
 * delivery — but when they disagree the ledger is right and the assumption is
 * how a merchant ends up reconciling against a bank statement by hand.
 *
 * No product carries a cost price, so nothing here is profit. It is revenue.
 */

const round2 = (value: number) => Math.round(value * 100) / 100

export interface AnalyticsTotals {
  orders: number
  sellableOrders: number
  cancelledOrders: number
  deliveredOrders: number
  returnedOrders: number
  grossSalesCents: number
  netSalesCents: number
  shippingCents: number
  discountsCents: number
  collectedCents: number
  inFlightCents: number
  cancelledValueCents: number
  refundedCents: number
  units: number
  aovCents: number
  unitsPerOrder: number
  /** Delivered as a share of orders that reached an outcome, in percent. */
  deliveryRate: number
  cancelRate: number
}

/** SQL fragment for the window, safe against a null (all-time) start. */
function windowClause(organizationId: string, window: DateWindow) {
  return window.start
    ? Prisma.sql`"organizationId" = ${organizationId} AND "createdAt" >= ${window.start} AND "createdAt" < ${window.end}`
    : Prisma.sql`"organizationId" = ${organizationId} AND "createdAt" < ${window.end}`
}

/**
 * The headline KPIs, in one pass.
 *
 * Written as raw SQL rather than several Prisma aggregates because every figure
 * is a conditional sum over the same rows: as separate queries this is a dozen
 * round trips and a dozen scans of the same index for numbers that must agree
 * with each other.
 */
export async function getTotals(
  organizationId: string,
  window: DateWindow
): Promise<AnalyticsTotals> {
  const [row] = await prisma.$queryRaw<
    {
      orders: bigint
      cancelled_orders: bigint
      delivered_orders: bigint
      returned_orders: bigint
      gross_sales: bigint | null
      net_sales: bigint | null
      shipping: bigint | null
      discounts: bigint | null
      collected: bigint | null
      cancelled_value: bigint | null
      refunded: bigint | null
      in_flight: bigint | null
    }[]
  >`
    SELECT
      COUNT(*)                                                        AS orders,
      COUNT(*) FILTER (WHERE "cancelledAt" IS NOT NULL)               AS cancelled_orders,
      COUNT(*) FILTER (WHERE "workflowState" = 'DELIVERED')           AS delivered_orders,
      COUNT(*) FILTER (WHERE "workflowState" = 'RETURNED')            AS returned_orders,
      COALESCE(SUM("subtotalCents")      FILTER (WHERE "cancelledAt" IS NULL), 0) AS gross_sales,
      COALESCE(SUM("totalCents")         FILTER (WHERE "cancelledAt" IS NULL), 0) AS net_sales,
      COALESCE(SUM("shippingTotalCents") FILTER (WHERE "cancelledAt" IS NULL), 0) AS shipping,
      COALESCE(SUM("discountTotalCents") FILTER (WHERE "cancelledAt" IS NULL), 0) AS discounts,
      -- Money actually received, from the running total the Transaction ledger
      -- maintains. Not "the value of delivered orders", which is an assumption.
      COALESCE(SUM("paidTotalCents"      ) FILTER (WHERE "cancelledAt" IS NULL), 0) AS collected,
      COALESCE(SUM("totalCents")         FILTER (WHERE "cancelledAt" IS NOT NULL), 0) AS cancelled_value,
      COALESCE(SUM("refundedTotalCents"), 0) AS refunded,
      -- Owed on orders still in play: not cancelled, not already settled one
      -- way or the other.
      COALESCE(SUM(GREATEST("totalCents" - "paidTotalCents", 0)) FILTER (
        WHERE "cancelledAt" IS NULL
          AND "workflowState" NOT IN ('DELIVERED', 'RETURNED', 'CANCELLED')
      ), 0) AS in_flight
    FROM "Order"
    WHERE ${windowClause(organizationId, window)}
  `

  // Units are net of returns, and cancelled orders are excluded — goods that
  // came back or never went out were not sold.
  const [unitRow] = await prisma.$queryRaw<{ units: bigint | null }[]>`
    SELECT COALESCE(SUM(l."quantity" - l."refundedQuantity"), 0) AS units
    FROM "OrderLine" l
    JOIN "Order" o ON o."id" = l."orderId"
    WHERE o."organizationId" = ${organizationId}
      ${window.start ? Prisma.sql`AND o."createdAt" >= ${window.start}` : Prisma.empty}
      AND o."createdAt" < ${window.end}
      AND o."cancelledAt" IS NULL
  `

  const n = (value: bigint | null | undefined) => Number(value ?? 0)

  const orders = n(row?.orders)
  const cancelledOrders = n(row?.cancelled_orders)
  const deliveredOrders = n(row?.delivered_orders)
  const sellableOrders = orders - cancelledOrders
  // Orders that reached an outcome. An order still on a van is neither a
  // success nor a failure yet, and counting it as either makes the delivery
  // rate swing with how busy last week was.
  const settled = deliveredOrders + cancelledOrders
  const netSalesCents = n(row?.net_sales)
  const units = n(unitRow?.units)

  return {
    orders,
    sellableOrders,
    cancelledOrders,
    deliveredOrders,
    returnedOrders: n(row?.returned_orders),
    grossSalesCents: n(row?.gross_sales),
    netSalesCents,
    shippingCents: n(row?.shipping),
    discountsCents: n(row?.discounts),
    collectedCents: n(row?.collected),
    inFlightCents: n(row?.in_flight),
    cancelledValueCents: n(row?.cancelled_value),
    refundedCents: n(row?.refunded),
    units,
    aovCents: sellableOrders ? Math.round(netSalesCents / sellableOrders) : 0,
    unitsPerOrder: sellableOrders ? round2(units / sellableOrders) : 0,
    deliveryRate: settled ? round2((deliveredOrders / settled) * 100) : 0,
    cancelRate: orders ? round2((cancelledOrders / orders) * 100) : 0,
  }
}

export interface SeriesPoint {
  key: string
  orders: number
  netSalesCents: number
  collectedCents: number
  cancelled: number
}

/**
 * Revenue and orders over time.
 *
 * Bucketed with `date_trunc` at the reporting timezone so a "day" is the
 * store's day. Empty buckets are filled in afterwards — a query only returns
 * days that had orders, and a chart drawn straight from that quietly closes the
 * gaps, turning a dead week into a straight line between two busy days.
 */
export async function getSeries(
  organizationId: string,
  window: DateWindow,
  granularity: Granularity
): Promise<SeriesPoint[]> {
  const unit = granularity === 'month' ? 'month' : 'day'
  const format = granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'

  const rows = await prisma.$queryRaw<
    {
      bucket: string
      orders: bigint
      net_sales: bigint | null
      collected: bigint | null
      cancelled: bigint
    }[]
  >`
    SELECT
      to_char(date_trunc(${unit}, "createdAt" AT TIME ZONE ${REPORTING_TIMEZONE}), ${format}) AS bucket,
      COUNT(*) AS orders,
      COALESCE(SUM("totalCents")     FILTER (WHERE "cancelledAt" IS NULL), 0) AS net_sales,
      COALESCE(SUM("paidTotalCents") FILTER (WHERE "cancelledAt" IS NULL), 0) AS collected,
      COUNT(*) FILTER (WHERE "cancelledAt" IS NOT NULL) AS cancelled
    FROM "Order"
    WHERE ${windowClause(organizationId, window)}
    GROUP BY 1
    ORDER BY 1
  `

  const byKey = new Map(rows.map((row) => [row.bucket, row]))
  const keys = window.start
    ? bucketKeys(window, granularity)
    : rows.map((row) => row.bucket)

  return keys.map((key) => {
    const row = byKey.get(key)
    return {
      key,
      orders: Number(row?.orders ?? 0),
      netSalesCents: Number(row?.net_sales ?? 0),
      collectedCents: Number(row?.collected ?? 0),
      cancelled: Number(row?.cancelled ?? 0),
    }
  })
}

export interface BreakdownRow {
  key: string
  label: string
  orders: number
  netSalesCents: number
}

/** Orders and revenue grouped by delivery state. */
export async function getByWorkflowState(
  organizationId: string,
  window: DateWindow
): Promise<BreakdownRow[]> {
  const rows = await prisma.$queryRaw<
    { key: string; orders: bigint; net_sales: bigint | null }[]
  >`
    SELECT
      "workflowState"::text AS key,
      COUNT(*) AS orders,
      COALESCE(SUM("totalCents") FILTER (WHERE "cancelledAt" IS NULL), 0) AS net_sales
    FROM "Order"
    WHERE ${windowClause(organizationId, window)}
    GROUP BY 1
    ORDER BY 2 DESC
  `

  return rows.map((row) => ({
    key: row.key,
    label: row.key,
    orders: Number(row.orders),
    netSalesCents: Number(row.net_sales ?? 0),
  }))
}

/** Orders and revenue grouped by payment status. */
export async function getByFinancialStatus(
  organizationId: string,
  window: DateWindow
): Promise<BreakdownRow[]> {
  const rows = await prisma.$queryRaw<
    { key: string; orders: bigint; net_sales: bigint | null }[]
  >`
    SELECT
      "financialStatus"::text AS key,
      COUNT(*) AS orders,
      COALESCE(SUM("totalCents") FILTER (WHERE "cancelledAt" IS NULL), 0) AS net_sales
    FROM "Order"
    WHERE ${windowClause(organizationId, window)}
    GROUP BY 1
    ORDER BY 2 DESC
  `

  return rows.map((row) => ({
    key: row.key,
    label: row.key,
    orders: Number(row.orders),
    netSalesCents: Number(row.net_sales ?? 0),
  }))
}

/**
 * Which storefront and which landing page produced the sales.
 *
 * The question every merchant running campaigns asks first: which page is
 * paying for itself. Orders keep the attribution even after the page is
 * deleted, so the label falls back rather than dropping the row.
 */
export async function getBySource(
  organizationId: string,
  window: DateWindow
): Promise<BreakdownRow[]> {
  const rows = await prisma.$queryRaw<
    {
      key: string | null
      label: string | null
      orders: bigint
      net_sales: bigint | null
    }[]
  >`
    SELECT
      COALESCE(o."pageId", o."storeId", 'direct')  AS key,
      COALESCE(p."title", s."name", 'Direct')      AS label,
      COUNT(*)                                     AS orders,
      COALESCE(SUM(o."totalCents") FILTER (WHERE o."cancelledAt" IS NULL), 0) AS net_sales
    FROM "Order" o
    LEFT JOIN "Page"  p ON p."id" = o."pageId"
    LEFT JOIN "Store" s ON s."id" = o."storeId"
    WHERE ${
      window.start
        ? Prisma.sql`o."organizationId" = ${organizationId} AND o."createdAt" >= ${window.start} AND o."createdAt" < ${window.end}`
        : Prisma.sql`o."organizationId" = ${organizationId} AND o."createdAt" < ${window.end}`
    }
    GROUP BY 1, 2
    ORDER BY 4 DESC
    LIMIT 12
  `

  return rows.map((row) => ({
    key: row.key ?? 'direct',
    label: row.label ?? 'Direct',
    orders: Number(row.orders),
    netSalesCents: Number(row.net_sales ?? 0),
  }))
}

export interface TopProduct {
  id: string
  title: string
  sku: string | null
  units: number
  orders: number
  revenueCents: number
}

/**
 * Best sellers by revenue.
 *
 * Grouped on the snapshotted title rather than the product id where the product
 * has been deleted, so a discontinued line still shows the revenue it earned
 * instead of vanishing from last quarter's report.
 */
export async function getTopProducts(
  organizationId: string,
  window: DateWindow,
  limit = 10
): Promise<TopProduct[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string
      title: string
      sku: string | null
      units: bigint
      orders: bigint
      revenue: bigint | null
    }[]
  >`
    SELECT
      COALESCE(l."productId", l."title")  AS id,
      MIN(l."title")                      AS title,
      MIN(l."sku")                        AS sku,
      SUM(l."quantity" - l."refundedQuantity")             AS units,
      COUNT(DISTINCT l."orderId")                          AS orders,
      SUM(l."totalCents")                                  AS revenue
    FROM "OrderLine" l
    JOIN "Order" o ON o."id" = l."orderId"
    WHERE o."organizationId" = ${organizationId}
      ${window.start ? Prisma.sql`AND o."createdAt" >= ${window.start}` : Prisma.empty}
      AND o."createdAt" < ${window.end}
      AND o."cancelledAt" IS NULL
    GROUP BY 1
    ORDER BY 6 DESC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sku: row.sku,
    units: Number(row.units),
    orders: Number(row.orders),
    revenueCents: Number(row.revenue ?? 0),
  }))
}

export interface TopCustomer {
  id: string | null
  name: string
  phone: string | null
  orders: number
  spentCents: number
}

export async function getTopCustomers(
  organizationId: string,
  window: DateWindow,
  limit = 10
): Promise<TopCustomer[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string | null
      name: string | null
      phone: string | null
      orders: bigint
      spent: bigint | null
    }[]
  >`
    SELECT
      o."customerId"                                        AS id,
      COALESCE(NULLIF(TRIM(CONCAT(c."firstName", ' ', c."lastName")), ''), o."email", o."phone", 'Guest') AS name,
      COALESCE(o."phone", c."phone")                        AS phone,
      COUNT(*)                                              AS orders,
      SUM(o."totalCents")                                   AS spent
    FROM "Order" o
    LEFT JOIN "Customer" c ON c."id" = o."customerId"
    WHERE o."organizationId" = ${organizationId}
      ${window.start ? Prisma.sql`AND o."createdAt" >= ${window.start}` : Prisma.empty}
      AND o."createdAt" < ${window.end}
      AND o."cancelledAt" IS NULL
    GROUP BY 1, 2, 3
    ORDER BY 5 DESC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? 'Guest',
    phone: row.phone,
    orders: Number(row.orders),
    spentCents: Number(row.spent ?? 0),
  }))
}

export interface CustomerSplit {
  buyers: number
  newBuyers: number
  returningBuyers: number
  returningSharePercent: number
}

/**
 * New versus returning buyers in the window.
 *
 * "Returning" means they had ordered *before this window opened*, not that they
 * ordered twice inside it — otherwise a loyal customer's first order of the
 * month reclassifies them as new every month.
 */
export async function getCustomerSplit(
  organizationId: string,
  window: DateWindow
): Promise<CustomerSplit> {
  const [row] = await prisma.$queryRaw<{ buyers: bigint; returning: bigint }[]>`
    WITH buyers AS (
      SELECT DISTINCT COALESCE(o."customerId", o."phone", o."email") AS buyer_key
      FROM "Order" o
      WHERE o."organizationId" = ${organizationId}
        ${window.start ? Prisma.sql`AND o."createdAt" >= ${window.start}` : Prisma.empty}
        AND o."createdAt" < ${window.end}
        AND o."cancelledAt" IS NULL
        AND COALESCE(o."customerId", o."phone", o."email") IS NOT NULL
    )
    SELECT
      COUNT(*) AS buyers,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Order" prior
          WHERE prior."organizationId" = ${organizationId}
            AND COALESCE(prior."customerId", prior."phone", prior."email") = buyers.buyer_key
            ${window.start ? Prisma.sql`AND prior."createdAt" < ${window.start}` : Prisma.sql`AND FALSE`}
        )
      ) AS returning
    FROM buyers
  `

  const buyers = Number(row?.buyers ?? 0)
  const returningBuyers = Number(row?.returning ?? 0)

  return {
    buyers,
    newBuyers: buyers - returningBuyers,
    returningBuyers,
    returningSharePercent: buyers
      ? round2((returningBuyers / buyers) * 100)
      : 0,
  }
}

export interface SalesAnalytics {
  granularity: Granularity
  window: DateWindow
  totals: AnalyticsTotals
  previousTotals: AnalyticsTotals | null
  series: SeriesPoint[]
  byWorkflowState: BreakdownRow[]
  byFinancialStatus: BreakdownRow[]
  bySource: BreakdownRow[]
  topProducts: TopProduct[]
  topCustomers: TopCustomer[]
  customers: CustomerSplit
}

/** Everything the analytics page renders, in one authorised call. */
export async function getSalesAnalytics(
  organizationId: string,
  window: DateWindow
): Promise<SalesAnalytics> {
  // Revenue is not for every workspace member to see by default, but the org
  // role ladder is what this platform has — VIEWER is the floor for reading
  // commerce data anywhere else, and analytics is a read of the order book.
  await requireOrgAccess(organizationId, 'VIEWER')

  const granularity = pickGranularity(window)
  const previous = previousRange(window)

  const [
    totals,
    previousTotals,
    series,
    byWorkflowState,
    byFinancialStatus,
    bySource,
    topProducts,
    topCustomers,
    customers,
  ] = await Promise.all([
    getTotals(organizationId, window),
    previous ? getTotals(organizationId, previous) : Promise.resolve(null),
    getSeries(organizationId, window, granularity),
    getByWorkflowState(organizationId, window),
    getByFinancialStatus(organizationId, window),
    getBySource(organizationId, window),
    getTopProducts(organizationId, window),
    getTopCustomers(organizationId, window),
    getCustomerSplit(organizationId, window),
  ])

  return {
    granularity,
    window,
    totals,
    previousTotals,
    series,
    byWorkflowState,
    byFinancialStatus,
    bySource,
    topProducts,
    topCustomers,
    customers,
  }
}

/** The daily/monthly series as CSV, for the export button. */
export function seriesToCsv(
  series: SeriesPoint[],
  granularity: Granularity,
  currencyCode: string,
  minorPerMajor: number
): string {
  const header = [
    granularity === 'month' ? 'Month' : 'Date',
    'Orders',
    `Net sales (${currencyCode})`,
    `Collected (${currencyCode})`,
    'Cancelled orders',
  ]

  const rows = series.map((point) =>
    [
      point.key,
      point.orders,
      (point.netSalesCents / minorPerMajor).toFixed(2),
      (point.collectedCents / minorPerMajor).toFixed(2),
      point.cancelled,
    ].join(',')
  )

  return [header.join(','), ...rows].join('\n')
}
