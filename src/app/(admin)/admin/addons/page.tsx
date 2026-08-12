import {
  listAddonsForAdmin,
  listPlansForAdmin,
} from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { AddonsClient, type AddonListItem } from './AddonsClient'

export const metadata = { title: 'Add-ons' }

export default async function AdminAddonsPage() {
  const [addons, plans] = await Promise.all([
    listAddonsForAdmin(),
    listPlansForAdmin(),
  ])

  // Mapped to a flat shape rather than passed straight through: these cross into
  // a client component, and shipping whole Prisma rows would send relation
  // objects and counts the form never reads.
  const items: AddonListItem[] = addons.map((addon) => ({
    id: addon.id,
    code: addon.code,
    name: addon.name,
    description: addon.description,
    position: addon.position,
    isActive: addon.isActive,
    currencyCode: addon.currencyCode,
    monthlyPriceCents: addon.monthlyPriceCents,
    annualPriceCents: addon.annualPriceCents,
    grantsCustomDomains: addon.grantsCustomDomains,
    grantsStorageMb: addon.grantsStorageMb,
    grantsTrafficMb: addon.grantsTrafficMb,
    grantsTeamMembers: addon.grantsTeamMembers,
    grantsFeature: addon.grantsFeature,
    maxQuantity: addon.maxQuantity,
    availableOnAllPlans: addon.availableOnAllPlans,
    planIds: addon.plans.map((row) => row.planId),
    subscriberCount: addon._count.subscriptionAddons,
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="Add-ons"
        description="Sold on top of a plan. Quota grants stack with the plan's own limits; feature add-ons only work where the plan marks that feature “Optional add-on”."
      />
      <AddonsClient
        addons={items}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
      />
    </div>
  )
}
