import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageWithSections } from '@/server/services/pageService'
import { BuilderShell } from '@/modules/builder/BuilderShell'
import {
  listPickerProducts,
  listSellableVariants,
} from '@/server/services/productService'
import {
  listOffersForPage,
  getPageCheckout,
} from '@/server/services/offerAdminService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { toCheckoutDraft } from '@/modules/builder/offer-drafts'
import { saveCheckoutAction } from './offer-actions'
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

  // The Delivery tab: how this page charges to ship, what it rewards a big
  // basket with, and how many offers currently cover it — the last only so the
  // tab can say whether the order form has anything to sell.
  const [settings, offerRows, checkout, picker] = await Promise.all([
    getOrganizationSettings(organization.id),
    listOffersForPage(organization.id, pageId),
    getPageCheckout(organization.id, storeId, pageId),
    listPickerProducts(organization.id),
  ])

  const currencyCode = settings?.currencyCode ?? picker.currencyCode

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
      delivery={{
        storeId,
        pageId,
        currencyCode,
        initialCheckout: toCheckoutDraft(checkout, currencyCode),
        offerCount: offerRows.filter((offer) => offer.isActive).length,
        saveCheckout: saveCheckoutAction,
      }}
      canvasSrc={`/builder-canvas/${pageId}`}
      onSave={saveSectionsAction.bind(null, storeId, pageId)}
    />
  )
}
