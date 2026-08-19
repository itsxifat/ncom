import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getCustomerForMerchant } from '@/server/services/customerService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/app/stat-card'
import { FinancialStatusBadge } from '@/components/store/status-badges'
import { WorkflowStateBadge } from '@/components/store/fraud-badges'
import { Money } from '@/components/store/form-controls'

export default async function CustomerDetailPage({
  params,
}: PageProps<'/customers/[customerId]'>) {
  const { customerId } = await params
  const { organization } = await getActiveOrganization()

  let customer
  try {
    customer = await getCustomerForMerchant(organization.id, customerId)
  } catch {
    notFound()
  }

  const settings = await getOrganizationSettings(organization.id)
  const currency = settings?.currencyCode ?? 'USD'
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ')

  // Average order value is computed from lifetime spend rather than the 50
  // orders loaded below, so it stays correct for long-standing customers.
  const averageOrderCents =
    customer.ordersCount > 0
      ? Math.round(customer.totalSpentCents / customer.ordersCount)
      : 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/customers`}
        backLabel="Customers"
        // A cash-on-delivery customer has a phone and often no email, so the
        // fallback chain has to end somewhere that is never empty.
        title={name || customer.email || customer.phone || 'Customer'}
        description={name ? (customer.email ?? customer.phone) : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Lifetime spend"
          value={formatMoney(customer.totalSpentCents, currency)}
          tone="ink"
        />
        <StatCard label="Orders" value={customer.ordersCount} />
        <StatCard
          label="Average order"
          value={formatMoney(averageOrderCents, currency)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Order history
            </h2>

            {customer.orders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet.</p>
            ) : (
              <div className="divide-border/60 flex flex-col divide-y">
                {customer.orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-muted-foreground text-sm">
                        {order.createdAt.toLocaleDateString()}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <FinancialStatusBadge status={order.financialStatus} />
                        <WorkflowStateBadge state={order.workflowState} />
                      </div>
                    </div>
                    <Money>
                      {formatMoney(order.totalCents, order.currencyCode)}
                    </Money>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Details
              </h2>
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{customer.email}</dd>
                </div>
                {customer.phone && (
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{customer.phone}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Customer since</dt>
                  <dd>{customer.createdAt.toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Marketing</dt>
                  <dd>
                    <Badge
                      variant={customer.acceptsMarketing ? 'lime' : 'outline'}
                    >
                      {customer.acceptsMarketing
                        ? 'Subscribed'
                        : 'Not subscribed'}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {customer.addresses.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Addresses
                </h2>
                {customer.addresses.map((address) => (
                  <address key={address.id} className="text-sm not-italic">
                    {address.isDefault && (
                      <Badge variant="secondary" className="mb-1">
                        Default
                      </Badge>
                    )}
                    <div>
                      {[address.firstName, address.lastName]
                        .filter(Boolean)
                        .join(' ')}
                    </div>
                    <div>{address.address1}</div>
                    {address.address2 && <div>{address.address2}</div>}
                    <div>
                      {[address.city, address.provinceCode, address.postalCode]
                        .filter(Boolean)
                        .join(' ')}
                    </div>
                    <div>{address.countryCode}</div>
                  </address>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}
