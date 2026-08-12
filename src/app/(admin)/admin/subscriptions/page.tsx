import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import {
  listPlanOrdersForAdmin,
  listSubscriptionsForAdmin,
} from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { SettingsSection } from '@/components/app/settings-section'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'

export const metadata = { title: 'Subscriptions' }

const STATUS_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> =
  {
    ACTIVE: 'secondary',
    TRIALING: 'secondary',
    PENDING: 'outline',
    PAST_DUE: 'destructive',
    CANCELED: 'outline',
    EXPIRED: 'outline',
  }

export default async function AdminSubscriptionsPage() {
  const [subscriptions, openOrders] = await Promise.all([
    listSubscriptionsForAdmin(),
    listPlanOrdersForAdmin('open'),
  ])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="Subscriptions"
        description="Every workspace and what it is entitled to. Open one to change its plan, set per-workspace limits, or waive enforcement."
      />

      {openOrders.length > 0 && (
        <SettingsSection
          title="Waiting on payment"
          description="Checkouts that came to more than ৳0. No gateway is connected, so these need activating by hand once payment is settled."
        >
          <ListPanel>
            {openOrders.map((order) => (
              <ListRow key={order.id}>
                <ListRowText
                  title={
                    <Link
                      href={`/admin/subscriptions/${order.organizationId}`}
                      className="hover:underline"
                    >
                      {order.organization.name}
                    </Link>
                  }
                  meta={`${order.plan.name} · ${order.interval === 'ANNUAL' ? 'annual' : 'monthly'} · ${order.createdAt.toLocaleDateString()}${order.couponCode ? ` · ${order.couponCode}` : ''}`}
                  badges={<Badge variant="outline">Awaiting payment</Badge>}
                />
                <ListRowActions>
                  <Money>
                    {formatMoney(order.totalCents, order.currencyCode)}
                  </Money>
                </ListRowActions>
              </ListRow>
            ))}
          </ListPanel>
        </SettingsSection>
      )}

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions"
          description="Workspaces get one automatically when they sign up."
        />
      ) : (
        <ListPanel>
          {subscriptions.map((subscription) => {
            const overrides = [
              subscription.overrideMaxPages,
              subscription.overrideMaxStores,
              subscription.overrideMaxCustomDomains,
              subscription.overrideMaxTeamMembers,
              subscription.overrideStorageMb,
              subscription.overrideMonthlyTrafficMb,
            ].filter((value) => value !== null).length

            return (
              <ListRow key={subscription.id}>
                <ListRowText
                  title={
                    <Link
                      href={`/admin/subscriptions/${subscription.organizationId}`}
                      className="hover:underline"
                    >
                      {subscription.organization.name}
                    </Link>
                  }
                  meta={
                    <>
                      {subscription.plan.name} ·{' '}
                      {subscription.interval === 'ANNUAL'
                        ? 'annual'
                        : 'monthly'}{' '}
                      · {subscription.organization._count.stores} sites ·{' '}
                      {subscription.organization._count.memberships} members
                      {subscription.addons.length > 0 &&
                        ` · ${subscription.addons.length} add-on${subscription.addons.length === 1 ? '' : 's'}`}
                      {subscription.coupon && ` · ${subscription.coupon.code}`}
                    </>
                  }
                  badges={
                    <>
                      <Badge
                        variant={
                          STATUS_VARIANT[subscription.status] ?? 'outline'
                        }
                      >
                        {subscription.status.toLowerCase()}
                      </Badge>
                      {overrides > 0 && (
                        <Badge variant="outline">
                          {overrides} override{overrides === 1 ? '' : 's'}
                        </Badge>
                      )}
                      {subscription.quotaEnforcementDisabled && (
                        <Badge variant="destructive">Limits waived</Badge>
                      )}
                      {subscription.cancelAtPeriodEnd && (
                        <Badge variant="outline">Cancelling</Badge>
                      )}
                    </>
                  }
                />
                <ListRowActions>
                  <Money>
                    {formatMoney(
                      subscription.unitPriceCents,
                      subscription.currencyCode
                    )}
                  </Money>
                </ListRowActions>
              </ListRow>
            )
          })}
        </ListPanel>
      )}
    </div>
  )
}
