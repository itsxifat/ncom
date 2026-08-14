import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPageByPreviewToken } from '@/server/services/pageService'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { getStorefrontCommerce } from '@/server/services/offerService'

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
}

export default async function TokenPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  let page
  try {
    page = await getPageByPreviewToken(token)
  } catch {
    notFound()
  }

  if (!page.store.theme) notFound()

  const commerce = await getStorefrontCommerce(
    page.id,
    page.storeId,
    page.store.organizationId
  )

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-foreground text-background px-4 py-2 text-center text-xs font-medium">
        Draft preview — not published, not indexed by search engines.
      </div>
      <div className="flex-1">
        <PageRenderer
          theme={page.store.theme}
          sections={page.sections}
          storeId={page.storeId}
          commerce={commerce}
        />
      </div>
    </div>
  )
}
