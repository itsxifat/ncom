import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageWithSections } from '@/server/services/pageService'
import { BuilderShell } from '@/modules/builder/BuilderShell'
import {
  listOfferProducts,
  listPickerProducts,
  listSellableVariants,
} from '@/server/services/productService'
import {
  listOffers,
  getPageCheckout,
} from '@/server/services/offerAdminService'
import { toOfferDrafts, toCheckoutDraft } from '@/modules/builder/offer-drafts'
import {
  deleteOfferAction,
  reorderOffersAction,
  saveCheckoutAction,
  saveOfferAction,
} from './offer-actions'
import { saveSectionsAction } from './actions'

export default async function PageEditPage({
  params,
}: {
  params: Promise<{ storeId: string; pageId: string }>
}) {
  const { storeId, pageId } = await params
  const { organization } = await getActiveOrganization()

  let page
  try {
    page = await getPageWithSections(organization.id, storeId, pageId)
  } catch {
    notFound()
  }

  if (!page.store.theme) {
    notFound()
  }

  // Organisation-scoped: one catalogue serves every storefront. Passing a
  // storeId here matched no products and left the picker permanently empty.
  const products = await listSellableVariants(organization.id)

  const initialSections = page.sections.map((section) => ({
    id: section.id,
    type: section.type,
    order: section.order,
    content: section.content as Record<string, unknown>,
    config: (section.config ?? {}) as Record<string, unknown>,
    isVisible: section.isVisible,
  }))

  // The Offers tab: what this page sells, and how it charges for delivery.
  const [catalogue, offerRows, checkout, picker] = await Promise.all([
    listOfferProducts(organization.id),
    listOffers(organization.id, storeId, pageId),
    getPageCheckout(organization.id, storeId, pageId),
    listPickerProducts(organization.id),
  ])

  return (
    <BuilderShell
      entityId={pageId}
      backHref={`/stores/${storeId}`}
      title={page.title}
      theme={page.store.theme}
      initialSections={initialSections}
      products={products}
      catalog={{
        products: picker.products,
        currencyCode: picker.currencyCode,
      }}
      offers={{
        storeId,
        pageId,
        products: catalogue.products,
        currencyCode: catalogue.currencyCode,
        pickerProducts: picker.products,
        initialOffers: toOfferDrafts(offerRows, catalogue.currencyCode),
        initialCheckout: toCheckoutDraft(checkout, catalogue.currencyCode),
        saveOffer: saveOfferAction,
        deleteOffer: deleteOfferAction,
        reorderOffers: reorderOffersAction,
        saveCheckout: saveCheckoutAction,
      }}
      canvasSrc={`/builder-canvas/${pageId}`}
      onSave={saveSectionsAction.bind(null, storeId, pageId)}
    />
  )
}
