import { notFound } from 'next/navigation'
import {
  getSubscriptionForAdmin,
  listAddonsForAdmin,
  listPlansForAdmin,
} from '@/server/services/planAdminService'
import { getUsageSnapshot } from '@/server/services/usageService'
import { getEntitlements } from '@/server/services/entitlementService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { StatCard } from '@/components/app/stat-card'
import { QUOTA_META, formatQuota, formatUsage } from '@/lib/plans'
import {
  SubscriptionEditor,
  type SubscriptionEditorData,
} from './SubscriptionEditor'

export default async function AdminSubscriptionDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params

  const [subscription, plans, addons, usage, entitlements] = await Promise.all([
    getSubscriptionForAdmin(organizationId),
    listPlansForAdmin(),
    listAddonsForAdmin(),
    getUsageSnapshot(organizationId),
    // Resolved entitlements, so the page shows the effective numbers (plan +
    // overrides + add-ons) rather than making an operator do that arithmetic.
    getEntitlements(organizationId),
  ])
  if (!subscription) notFound()

  const data: SubscriptionEditorData = {
    organizationId,
    organizationName: subscription.organization.name,
    planId: subscription.planId,
    interval: subscription.interval,
    status: subscription.status,
    currencyCode: subscription.currencyCode,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    overrideMaxPages: subscription.overrideMaxPages,
    overrideMaxStores: subscription.overrideMaxStores,
    overrideMaxCustomDomains: subscription.overrideMaxCustomDomains,
    overrideMaxTeamMembers: subscription.overrideMaxTeamMembers,
    overrideStorageMb: subscription.overrideStorageMb,
    overrideMonthlyTrafficMb: subscription.overrideMonthlyTrafficMb,
    quotaEnforcementDisabled: subscription.quotaEnforcementDisabled,
    adminNote: subscription.adminNote,
    addons: subscription.addons.map((line) => ({
      addonId: line.addonId,
      quantity: line.quantity,
    })),
    orders: subscription.orders.map((order) => ({
      id: order.id,
      planName: order.plan.name,
      status: order.status,
      totalCents: order.totalCents,
      currencyCode: order.currencyCode,
      couponCode: order.couponCode,
      createdAt: order.createdAt.toISOString(),
      interval: order.interval,
    })),
  }

  const plan = subscription.plan

  return (
    <PageShell>
      <PageHeader
        eyebrow="Monetization"
        title={subscription.organization.name}
        description={
          <>
            On <strong>{plan.name}</strong> since{' '}
            {subscription.startedAt.toLocaleDateString()}. Workspace ID{' '}
            <span className="font-mono text-xs">{organizationId}</span>
          </>
        }
        backHref="/admin/subscriptions"
        backLabel="Subscriptions"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={QUOTA_META.PAGES.label}
          value={`${formatUsage(usage.pages, 'count')} / ${formatQuota(entitlements.quotas.PAGES, 'count')}`}
        />
        <StatCard
          label={QUOTA_META.STORAGE_BYTES.label}
          value={`${formatUsage(usage.storageBytes, 'bytes')} / ${formatQuota(entitlements.quotas.STORAGE_BYTES, 'bytes')}`}
        />
        <StatCard
          label={`${QUOTA_META.MONTHLY_TRAFFIC_BYTES.label} (${usage.period})`}
          value={`${formatUsage(usage.monthlyTrafficBytes, 'bytes')} / ${formatQuota(entitlements.quotas.MONTHLY_TRAFFIC_BYTES, 'bytes')}`}
        />
        <StatCard
          label={QUOTA_META.TEAM_MEMBERS.label}
          value={`${formatUsage(usage.teamMembers, 'count')} / ${formatQuota(entitlements.quotas.TEAM_MEMBERS, 'count')}`}
          hint="Members plus pending invitations"
        />
      </div>

      <SubscriptionEditor
        data={data}
        plans={plans.map((row) => ({ id: row.id, name: row.name }))}
        addons={addons.map((addon) => ({
          id: addon.id,
          name: addon.name,
          monthlyPriceCents: addon.monthlyPriceCents,
          currencyCode: addon.currencyCode,
          maxQuantity: addon.maxQuantity,
        }))}
        planLimits={{
          pages: formatQuota(plan.maxPages, 'count'),
          stores: formatQuota(plan.maxStores, 'count'),
          domains: formatQuota(plan.maxCustomDomains, 'count'),
          members: formatQuota(plan.maxTeamMembers, 'count'),
          storage:
            plan.storageMb === null ? 'Unlimited' : `${plan.storageMb} MB`,
          traffic:
            plan.monthlyTrafficMb === null
              ? 'Unlimited'
              : `${plan.monthlyTrafficMb} MB`,
        }}
      />
    </PageShell>
  )
}
