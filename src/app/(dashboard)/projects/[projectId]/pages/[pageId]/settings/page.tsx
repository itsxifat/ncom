import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageForSeoSettings } from '@/server/services/pageService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSeoForm } from './PageSeoForm'

export default async function PageSeoSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string; pageId: string }>
}) {
  const { projectId, pageId } = await params
  const { organization } = await getActiveOrganization()

  let page
  try {
    page = await getPageForSeoSettings(organization.id, projectId, pageId)
  } catch {
    notFound()
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display mb-6 text-3xl font-semibold tracking-tight">
        Page settings
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO</CardTitle>
        </CardHeader>
        <CardContent>
          <PageSeoForm
            key={page.updatedAt.toISOString()}
            projectId={projectId}
            pageId={pageId}
            title={page.title}
            slug={page.slug}
            isHome={page.isHome}
            seoTitle={page.seoTitle}
            seoDescription={page.seoDescription}
            robotsIndex={page.robotsIndex}
            ogImageMediaId={page.ogImageMediaId}
            ogImageUrl={page.ogImage?.url ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
