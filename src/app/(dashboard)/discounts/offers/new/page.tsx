import { getActiveOrganization } from '@/server/services/organizationService'
import { PageHeader } from '@/components/app/page-header'
import { OfferForm } from '@/components/store/offer-form'
import { loadOfferContext } from '../offer-data'

export default async function NewOfferPage() {
  const { organization } = await getActiveOrganization()
  const { currencyCode, products, productsCursor, productsTotal, stores } =
    await loadOfferContext(organization.id)

  // A workspace with exactly one store has nothing to choose, so it is chosen.
  const onlyStore = stores.length === 1 ? stores[0] : null

  return (
    <>
      <PageHeader
        backHref="/discounts/offers"
        backLabel="Offers"
        title="New offer"
      />
      <OfferForm
        currencyCode={currencyCode}
        products={products}
        productsCursor={productsCursor}
        productsTotal={productsTotal}
        stores={stores}
        initial={{
          label: '',
          description: '',
          badge: '',
          scope: 'PAGE',
          storeId: onlyStore?.id ?? '',
          pageId: '',
          kind: 'FIXED',
          pricingMode: 'AUTO',
          price: '',
          discountPercent: '',
          compareAt: '',
          minQuantity: '',
          maxQuantity: '',
          // Threshold rather than exact, because it is what a merchant means
          // when they say "3 for 1000" and the alternative refuses orders.
          tierMode: 'THRESHOLD',
          tiers: [],
          items: [],
          variantRules: [],
          giftVariantId: '',
          giftQuantity: '1',
          startsAt: '',
          endsAt: '',
          isDefault: false,
          isActive: true,
        }}
      />
    </>
  )
}
