import { getActiveOrganization } from '@/server/services/organizationService'
import { listMediaAssets } from '@/server/services/mediaService'
import { PageHeader } from '@/components/app/page-header'
import { MediaLibraryClient } from './MediaLibraryClient'

export default async function MediaLibraryPage() {
  const { organization } = await getActiveOrganization()
  const assets = await listMediaAssets(organization.id)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref="/"
        backLabel="Dashboard"
        eyebrow={organization.name}
        title="Media library"
        description="Images shared across every store in this workspace."
      />
      <MediaLibraryClient initialAssets={assets} />
    </div>
  )
}
