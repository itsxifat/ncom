import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageForSeoSettings } from '@/server/services/pageService'
import { PageHeader } from '@/components/app/page-header'
import { SettingsSection } from '@/components/app/settings-section'
import { PageSeoForm } from './PageSeoForm'

export default async function PageSeoSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string; pageId: string }>
}) {
  const { storeId, pageId } = await params
  const { organization } = await getActiveOrganization()

  let page
  try {
    page = await getPageForSeoSettings(organization.id, storeId, pageId)
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/stores/${storeId}`}
        backLabel="Back to store"
        eyebrow="Page"
        title={page.title}
        description="How this page is addressed, and how it looks when someone shares it."
      />
      <SettingsSection
        title="Search and sharing"
        description="Title, description, and the image that appears on social cards."
      >
        <PageSeoForm
          key={page.updatedAt.toISOString()}
          storeId={storeId}
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
      </SettingsSection>
    </div>
  )
}
