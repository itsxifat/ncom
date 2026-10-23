import { notFound } from 'next/navigation'
import { getPageForRawPreview } from '@/server/services/pageService'
import { CanvasClient } from '@/modules/builder/CanvasFrame'
import { getStorefrontCommerce } from '@/server/services/offerService'
import { builderStorefront } from '@/server/storefront/builder'
import { env } from '@/lib/env'

export default async function BuilderCanvasPage({
  params,
}: {
  params: Promise<{ pageId: string }>
}) {
  const { pageId } = await params

  let page
  try {
    page = await getPageForRawPreview(pageId)
  } catch {
    notFound()
  }

  if (!page.store.theme) {
    notFound()
  }

  // A store's page is drawn with its shop around it; the shell posts the
  // header and footer in as soon as the canvas says it is ready.
  if (page.store.kind === 'STORE') {
    const { storefront, products } = await builderStorefront({
      organizationId: page.store.organizationId,
      storeName: page.store.name,
      liveUrl: `http://${page.store.subdomain}.${env.ROOT_DOMAIN}`,
      role: page.role,
      sections: page.sections,
    })
    return (
      <CanvasClient
        initialTheme={page.store.theme}
        initialSections={page.sections}
        storeId={page.storeId}
        storefront={storefront}
        initialProducts={products}
      />
    )
  }

  const commerce = await getStorefrontCommerce(
    page.id,
    page.storeId,
    page.store.organizationId
  )

  return (
    <CanvasClient
      initialTheme={page.store.theme}
      initialSections={page.sections}
      commerce={commerce}
    />
  )
}
