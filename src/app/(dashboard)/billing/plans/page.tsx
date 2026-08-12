import { redirect } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getEntitlements } from '@/server/services/entitlementService'
import {
  listSelectableAddons,
  listSelectablePlans,
} from '@/server/services/planCheckoutService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { PageHeader } from '@/components/app/page-header'
import { FEATURE_KEYS, FEATURE_PLAN_COLUMN, formatQuota } from '@/lib/plans'
import { PlanPicker, type PickerAddon, type PickerPlan } from './PlanPicker'

export const metadata = { title: 'Change plan' }

export default async function ChangePlanPage() {
  const { organization, role } = await getActiveOrganization()

  if (role !== 'OWNER') redirect('/billing')
  if (!(await getPlatformFlag('billing.selfServeUpgrades')))
    redirect('/billing')

  const entitlements = await getEntitlements(organization.id)
  const plans = await listSelectablePlans()

  // Add-ons are fetched per plan and merged, so the picker can filter client-side
  // as the customer switches plan without a round trip for each one.
  const addonsByPlan = await Promise.all(
    plans.map(async (plan) => ({
      planId: plan.id,
      addons: await listSelectableAddons(plan.id),
    }))
  )

  const addonMap = new Map<string, PickerAddon>()
  for (const entry of addonsByPlan) {
    for (const addon of entry.addons) {
      const existing = addonMap.get(addon.id)
      if (existing) {
        // Available on more than one plan: accumulate rather than overwrite, and
        // `null` (every plan) stays null.
        if (existing.planIds !== null) existing.planIds.push(entry.planId)
        continue
      }
      addonMap.set(addon.id, {
        id: addon.id,
        name: addon.name,
        description: addon.description,
        currencyCode: addon.currencyCode,
        monthlyPriceCents: addon.monthlyPriceCents,
        annualPriceCents: addon.annualPriceCents,
        maxQuantity: addon.maxQuantity,
        planIds: addon.availableOnAllPlans ? null : [entry.planId],
      })
    }
  }

  const pickerPlans: PickerPlan[] = plans.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    tagline: plan.tagline,
    currencyCode: plan.currencyCode,
    monthlyPriceCents: plan.monthlyPriceCents,
    annualPriceCents: plan.annualPriceCents,
    isContactSalesOnly: plan.isContactSalesOnly,
    trialDays: plan.trialDays,
    fairUseNote: plan.fairUseNote,
    quotaLabels: [
      { label: 'Landing pages', value: formatQuota(plan.maxPages, 'count') },
      {
        label: 'Custom domains',
        value: formatQuota(plan.maxCustomDomains, 'count'),
      },
      {
        label: 'Storage',
        value: formatQuota(
          plan.storageMb === null ? null : plan.storageMb * 1024 * 1024,
          'bytes'
        ),
      },
      {
        label: 'Monthly traffic',
        value: formatQuota(
          plan.monthlyTrafficMb === null
            ? null
            : plan.monthlyTrafficMb * 1024 * 1024,
          'bytes'
        ),
      },
      {
        label: 'Team members',
        value: formatQuota(plan.maxTeamMembers, 'count'),
      },
    ],
    availability: Object.fromEntries(
      FEATURE_KEYS.map((key) => [key, plan[FEATURE_PLAN_COLUMN[key]]])
    ),
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Workspace"
        title="Change plan"
        description="Pick a plan, add anything you need on top, and apply a code if you have one."
        backHref="/billing"
        backLabel="Plan & billing"
      />

      <PlanPicker
        plans={pickerPlans}
        addons={Array.from(addonMap.values())}
        currentPlanId={entitlements.planId}
        currentInterval={entitlements.interval}
        couponsEnabled={await getPlatformFlag('billing.couponsEnabled')}
        showPaymentStep={await getPlatformFlag('billing.showPaymentStep')}
      />
    </div>
  )
}
