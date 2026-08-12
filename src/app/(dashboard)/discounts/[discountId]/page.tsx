import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getDiscount } from '@/server/services/discountService'
import { listProducts } from '@/server/services/productService'
import { listCollections } from '@/server/services/collectionService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { centsToMajorString, bpsToPercent } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DiscountForm } from '@/components/store/discount-form'

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

  const [{ items }, collections, settings] = await Promise.all([
    listProducts(organization.id, { take: 200 }),
    listCollections(organization.id),
    getOrganizationSettings(organization.id),
  ])

  const currency = settings?.currencyCode ?? 'USD'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/discounts`}
        backLabel="Discounts"
        title={discount.title}
        description={`Used ${discount.usageCount} times.`}
      />
      <DiscountForm
        currencyCode={currency}
        products={items.map((p) => ({ id: p.id, title: p.title }))}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
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
          appliesTo: discount.appliesTo,
          targetProductIds: discount.targetProductIds,
          targetCollectionIds: discount.targetCollectionIds,
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
    </div>
  )
}
