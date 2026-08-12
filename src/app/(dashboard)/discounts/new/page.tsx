import { getActiveOrganization } from '@/server/services/organizationService'
import { listProducts } from '@/server/services/productService'
import { listCollections } from '@/server/services/collectionService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { PageHeader } from '@/components/app/page-header'
import { DiscountForm } from '@/components/store/discount-form'

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default async function NewDiscountPage() {
  const { organization } = await getActiveOrganization()

  const [{ items }, collections, settings] = await Promise.all([
    listProducts(organization.id, { take: 200 }),
    listCollections(organization.id),
    getOrganizationSettings(organization.id),
  ])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/discounts`}
        backLabel="Discounts"
        title="New discount"
      />
      <DiscountForm
        currencyCode={settings?.currencyCode ?? 'USD'}
        products={items.map((p) => ({ id: p.id, title: p.title }))}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
        initial={{
          title: '',
          method: 'CODE',
          type: 'PERCENTAGE',
          percentage: '',
          amount: '',
          appliesTo: 'ALL',
          targetProductIds: [],
          targetCollectionIds: [],
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
    </div>
  )
}
