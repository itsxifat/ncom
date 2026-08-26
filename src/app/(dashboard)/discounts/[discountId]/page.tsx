import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getDiscount } from '@/server/services/discountService'
import { listCollections } from '@/server/services/collectionService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { centsToMajorString, bpsToPercent } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DiscountForm } from '@/components/store/discount-form'
import { loadDiscountTargets } from '../discount-data'

function toLocalInput(date: Date | null): string {
  if (!date) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default async function EditDiscountPage({
  params,
}: PageProps<'/discounts/[discountId]'>) {
  const { discountId } = await params
  const { organization } = await getActiveOrganization()

  let discount
  try {
    discount = await getDiscount(organization.id, discountId)
  } catch {
    notFound()
  }

  const [targets, collections, settings] = await Promise.all([
    loadDiscountTargets(organization.id),
    listCollections(organization.id),
    getOrganizationSettings(organization.id),
  ])

  const currency = settings?.currencyCode ?? 'USD'

  return (
    <>
      <PageHeader
        backHref={`/discounts`}
        backLabel="Discounts"
        title={discount.title}
        description={`Used ${discount.usageCount} times.`}
      />
      <DiscountForm
        currencyCode={currency}
        products={targets.products}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
        stores={targets.stores}
        variants={targets.variants}
        initial={{
          id: discount.id,
          title: discount.title,
          method: discount.method,
          type: discount.type,
          percentage:
            discount.valueBps !== null
              ? String(bpsToPercent(discount.valueBps))
              : '',
          amount: centsToMajorString(discount.valueCents, currency),
          maxDiscount: centsToMajorString(discount.maxDiscountCents, currency),
          storeIds: discount.storeIds,
          appliesTo: discount.appliesTo,
          targetProductIds: discount.targetProductIds,
          targetCollectionIds: discount.targetCollectionIds,
          targetVariantIds: discount.targetVariantIds,
          excludedProductIds: discount.excludedProductIds,
          excludedVariantIds: discount.excludedVariantIds,
          minimumSubtotal: centsToMajorString(
            discount.minimumSubtotalCents,
            currency
          ),
          minimumQuantity:
            discount.minimumQuantity !== null
              ? String(discount.minimumQuantity)
              : '',
          buyQuantity:
            discount.buyQuantity !== null ? String(discount.buyQuantity) : '',
          getQuantity:
            discount.getQuantity !== null ? String(discount.getQuantity) : '',
          usageLimit:
            discount.usageLimit !== null ? String(discount.usageLimit) : '',
          oncePerCustomer: discount.oncePerCustomer,
          combinesWithOther: discount.combinesWithOther,
          startsAt: toLocalInput(discount.startsAt),
          endsAt: toLocalInput(discount.endsAt),
          isActive: discount.isActive,
          codes: discount.codes.map((code) => code.code),
        }}
      />
    </>
  )
}
