import { notFound } from 'next/navigation'
import { getPageForRawPreview } from '@/server/services/pageService'
import { CanvasClient } from '@/modules/builder/CanvasFrame'
import { getStorefrontCommerce } from '@/server/services/offerService'

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
