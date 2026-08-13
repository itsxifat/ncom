import Link from 'next/link'
import { BarChart3, Download } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getSalesAnalytics } from '@/server/services/salesAnalyticsService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { resolveRange, percentChange } from '@/lib/date-range'
import { formatMoney } from '@/lib/money'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/app/empty-state'
import { AnalyticsFilterBar } from '@/components/store/analytics-filter-bar'
import { AnalyticsTrend } from '@/components/store/analytics-trend'
import {
  BarList,
  ChartCard,
  MetricCard,
} from '@/components/store/analytics-parts'

export const metadata = { title: 'Analytics' }

const FINANCIAL_LABEL: Record<string, string> = {
  PENDING: 'Payment pending',
  AUTHORIZED: 'Authorized',
  PARTIALLY_PAID: 'Partly paid',
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  VOIDED: 'Voided',
}

/**
 * Sales analytics.
 *
 * Ordered by the question a merchant opens it to answer: how much money, then
 * where it came from, then what sold, then who bought. The money figures are
 * split by certainty rather than summed into one "revenue" number — in a
 * cash-on-delivery market an invoiced order and a collected one are different
 * assets, and a report that adds them tells the merchant they can afford stock
 * they cannot.
 */
export default async function AnalyticsPage({
  searchParams,
}: PageProps<'/analytics'>) {
  const query = await searchParams

  const range = typeof query.range === 'string' ? query.range : 'last_30_days'
  const from = typeof query.from === 'string' ? query.from : ''
  const to = typeof query.to === 'string' ? query.to : ''

  const { organization } = await getActiveOrganization()
  const window = resolveRange({ range, from, to })

  const [analytics, orgSettings] = await Promise.all([
    getSalesAnalytics(organization.id, window),
    getOrganizationSettings(organization.id),
  ])

  const currency = orgSettings?.currencyCode ?? 'BDT'
  const money = (cents: number) => formatMoney(cents, currency)

  const { totals, previousTotals, customers } = analytics
  const change = (pick: (t: typeof totals) => number) =>
    previousTotals
      ? percentChange(pick(totals), pick(previousTotals))
      : undefined

  const exportHref = `/api/analytics/export?${new URLSearchParams({
    range,
    ...(from && { from }),
    ...(to && { to }),
  })}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Sales, delivery performance and where the orders come from."
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={exportHref} download />}
          >
            <Download />
            Export CSV
          </Button>
        }
      />

      <AnalyticsFilterBar range={range} from={from} to={to} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Invoiced"
          value={money(totals.netSalesCents)}
          change={change((t) => t.netSalesCents)}
          hint="cancellations excluded"
        />
        <MetricCard
          label="Collected"
          value={money(totals.collectedCents)}
          change={change((t) => t.collectedCents)}
          hint={`${money(totals.inFlightCents)} still owed`}
        />
        <MetricCard
          label="Orders"
          value={totals.orders.toLocaleString()}
          change={change((t) => t.orders)}
          hint={`${totals.sellableOrders} live · ${totals.cancelledOrders} cancelled`}
        />
        <MetricCard
          label="Average order"
          value={money(totals.aovCents)}
          change={change((t) => t.aovCents)}
          hint={`${totals.unitsPerOrder} item${totals.unitsPerOrder === 1 ? '' : 's'} per order`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Units sold"
          value={totals.units.toLocaleString()}
          change={change((t) => t.units)}
          hint="net of returns"
        />
        <MetricCard
          label="Customers"
          value={customers.buyers.toLocaleString()}
          hint={`${customers.newBuyers} new · ${customers.returningBuyers} returning`}
        />
        <MetricCard
          label="Delivery rate"
          value={`${totals.deliveryRate}%`}
          change={change((t) => t.deliveryRate)}
          hint={`${totals.deliveredOrders} delivered of ${totals.deliveredOrders + totals.cancelledOrders} settled`}
        />
        <MetricCard
          label="Lost to cancellations"
          value={money(totals.cancelledValueCents)}
          change={change((t) => t.cancelledValueCents)}
          invert
          hint={`${totals.cancelRate}% of orders placed`}
        />
      </div>

      {totals.orders === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={BarChart3}
              title="No orders in this period"
              description="Pick a wider date range, or come back once orders start arriving."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <ChartCard
            title="Money over time"
            subtitle="What was invoiced against what has actually been collected. The gap is what is still out with couriers."
          >
            <AnalyticsTrend
              series={analytics.series}
              granularity={analytics.granularity}
              formatMoney={money}
            />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="Where orders come from"
              subtitle="Invoiced sales by landing page or storefront"
            >
              <BarList
                rows={analytics.bySource.map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.netSalesCents,
                  formatted: money(row.netSalesCents),
                  sub: `${row.orders} order${row.orders === 1 ? '' : 's'}`,
                }))}
              />
            </ChartCard>

            <ChartCard
              title="Delivery pipeline"
              subtitle="Every order placed in the period"
            >
              <BarList
                rows={analytics.byWorkflowState.map((row) => ({
                  key: row.key,
                  label:
                    WORKFLOW_STATE_LABEL[
                      row.key as keyof typeof WORKFLOW_STATE_LABEL
                    ] ?? row.key,
                  value: row.orders,
                  formatted: row.orders.toLocaleString(),
                  sub: money(row.netSalesCents),
                }))}
              />
            </ChartCard>

            <ChartCard
              title="Payment status"
              subtitle="Invoiced sales by how far the money has got"
            >
              <BarList
                rows={analytics.byFinancialStatus.map((row) => ({
                  key: row.key,
                  label: FINANCIAL_LABEL[row.key] ?? row.key,
                  value: row.netSalesCents,
                  formatted: money(row.netSalesCents),
                  sub: `${row.orders} order${row.orders === 1 ? '' : 's'}`,
                }))}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="How the total is built"
              subtitle="From goods ordered to money in hand"
              className="lg:col-span-1"
            >
              <dl className="flex flex-col gap-2.5 text-sm">
                {[
                  {
                    label: 'Goods before discount',
                    value: totals.grossSalesCents,
                  },
                  { label: 'Discounts given', value: -totals.discountsCents },
                  { label: 'Shipping charged', value: totals.shippingCents },
                  {
                    label: 'Invoiced',
                    value: totals.netSalesCents,
                    strong: true,
                  },
                  { label: 'Collected', value: totals.collectedCents },
                  { label: 'Still owed', value: totals.inFlightCents },
                  { label: 'Cancelled', value: -totals.cancelledValueCents },
                  { label: 'Refunded', value: -totals.refundedCents },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`flex justify-between gap-4 ${row.strong ? 'border-t pt-2.5 font-semibold' : ''}`}
                  >
                    <dt className={row.strong ? '' : 'text-muted-foreground'}>
                      {row.label}
                    </dt>
                    <dd className="tabular-nums">
                      {row.value < 0 ? '−' : ''}
                      {money(Math.abs(row.value))}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
                Products carry no cost price, so these are revenue figures — not
                profit.
              </p>
            </ChartCard>

            <ChartCard
              title="Best sellers"
              subtitle="Top products by revenue"
              className="lg:col-span-2"
            >
              {analytics.topProducts.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nothing sold in this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-md text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs">
                        {['Product', 'Units', 'Orders', 'Revenue'].map(
                          (head, index) => (
                            <th
                              key={head}
                              className={`pb-2 font-medium ${index ? 'text-right' : 'text-left'}`}
                            >
                              {head}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topProducts.map((product) => (
                        <tr key={product.id} className="border-t">
                          <td className="py-2 pr-3">
                            <p className="truncate">{product.title}</p>
                            {product.sku && (
                              <p className="text-muted-foreground font-mono text-xs">
                                {product.sku}
                              </p>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {product.units}
                          </td>
                          <td className="text-muted-foreground py-2 text-right tabular-nums">
                            {product.orders}
                          </td>
                          <td className="py-2 text-right font-medium whitespace-nowrap tabular-nums">
                            {money(product.revenueCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="New vs returning"
              subtitle="Customers who ordered in this period"
            >
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-display text-2xl font-semibold tabular-nums">
                    {customers.returningSharePercent}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    of buyers had ordered before
                  </p>
                </div>
                <BarList
                  rows={[
                    {
                      key: 'new',
                      label: 'First-time buyers',
                      value: customers.newBuyers,
                      formatted: customers.newBuyers.toLocaleString(),
                    },
                    {
                      key: 'returning',
                      label: 'Returning buyers',
                      value: customers.returningBuyers,
                      formatted: customers.returningBuyers.toLocaleString(),
                    },
                  ]}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Top customers"
              subtitle="By spend in this period"
              className="lg:col-span-2"
            >
              {analytics.topCustomers.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No customers in this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-md text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs">
                        {['Customer', 'Orders', 'Spent'].map((head, index) => (
                          <th
                            key={head}
                            className={`pb-2 font-medium ${index ? 'text-right' : 'text-left'}`}
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topCustomers.map((customer, index) => (
                        <tr
                          key={`${customer.id ?? 'guest'}-${index}`}
                          className="border-t"
                        >
                          <td className="py-2 pr-3">
                            {customer.id ? (
                              <Link
                                href={`/customers/${customer.id}`}
                                className="hover:underline"
                              >
                                {customer.name}
                              </Link>
                            ) : (
                              customer.name
                            )}
                            {customer.phone && (
                              <p className="text-muted-foreground text-xs">
                                {customer.phone}
                              </p>
                            )}
                          </td>
                          <td className="text-muted-foreground py-2 text-right tabular-nums">
                            {customer.orders}
                          </td>
                          <td className="py-2 text-right font-medium whitespace-nowrap tabular-nums">
                            {money(customer.spentCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
