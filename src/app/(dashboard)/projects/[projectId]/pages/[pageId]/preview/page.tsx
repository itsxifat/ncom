import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageWithSections } from '@/server/services/pageService'

export default async function PagePreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; pageId: string }>
}) {
  const { projectId, pageId } = await params
  const { organization } = await getActiveOrganization()

  let page
  try {
    page = await getPageWithSections(organization.id, projectId, pageId)
  } catch {
    notFound()
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Preview — {page.title}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          This shows your current draft, including unsaved section content.
        </p>
      </div>
      <iframe
        src={`/preview-render/${page.id}`}
        title={`Preview of ${page.title}`}
        className="bg-card flex-1 rounded-lg border"
      />
    </div>
  )
}
