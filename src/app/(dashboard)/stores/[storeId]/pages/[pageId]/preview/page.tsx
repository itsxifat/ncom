import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageWithSections } from '@/server/services/pageService'
import { PageHeader } from '@/components/app/page-header'

export default async function PagePreviewPage({
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

  return (
    <div className="flex h-[calc(100svh-12rem)] min-h-125 flex-col gap-6">
      <PageHeader
        backHref={`/stores/${storeId}`}
        backLabel="Back to store"
        eyebrow="Draft preview"
        title={page.title}
        description="This shows your current draft, including unsaved section content."
      />
      <iframe
        src={`/preview-render/${page.id}`}
        title={`Preview of ${page.title}`}
        className="bg-card ring-foreground/6 shadow-panel flex-1 overflow-hidden rounded-xl ring-1"
      />
    </div>
  )
}
