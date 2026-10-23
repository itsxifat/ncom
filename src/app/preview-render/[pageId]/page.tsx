import { notFound } from 'next/navigation'
import { getPageForRawPreview } from '@/server/services/pageService'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { getStorefrontCommerce } from '@/server/services/offerService'
import { StoreDraftPreview } from '@/server/storefront/preview'

export default async function PreviewRenderPage({
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

  if (page.store.kind === 'STORE') return <StoreDraftPreview page={page} />

  // The builder canvas is the merchant's only view of the form before it goes
  // live, so it has to be fed the same offers the public page would be.
  const commerce = await getStorefrontCommerce(
    page.id,
    page.storeId,
    page.store.organizationId
  )

  return (
    <PageRenderer
      theme={page.store.theme}
      sections={page.sections}
      storeId={page.storeId}
      commerce={commerce}
    />
  )
}
