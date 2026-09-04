import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { PageHeader } from '@/components/app/page-header'
import { DiscountForm } from '@/components/store/discount-form'
import { loadDiscountTargets } from '../discount-data'

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default async function NewDiscountPage() {
  const { organization } = await getActiveOrganization()

  const [targets, settings] = await Promise.all([
    loadDiscountTargets(organization.id),
    getOrganizationSettings(organization.id),
  ])

  return (
    <>
      <PageHeader
        backHref={`/discounts`}
        backLabel="Discounts"
        title="New discount"
      />
      <DiscountForm
        currencyCode={settings?.currencyCode ?? 'USD'}
        products={targets.products}
        collections={targets.collections}
        stores={targets.stores}
        variants={targets.variants}
        initial={{
          title: '',
          method: 'CODE',
          type: 'PERCENTAGE',
          percentage: '',
          amount: '',
          maxDiscount: '',
          storeIds: [],
          appliesTo: 'ALL',
          targetProductIds: [],
          targetCollectionIds: [],
          targetVariantIds: [],
          excludedProductIds: [],
          excludedVariantIds: [],
          minimumSubtotal: '',
          minimumQuantity: '',
          buyQuantity: '',
          getQuantity: '',
          usageLimit: '',
          oncePerCustomer: false,
          combinesWithOther: false,
          startsAt: toLocalInput(new Date()),
          endsAt: '',
          isActive: true,
          codes: [],
        }}
      />
    </>
  )
}
