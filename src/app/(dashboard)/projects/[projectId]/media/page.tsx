import { getActiveOrganization } from '@/server/services/organizationService'
import { listMediaAssets } from '@/server/services/mediaService'
import { MediaLibraryClient } from './MediaLibraryClient'

export default async function ProjectMediaPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { organization } = await getActiveOrganization()
  const assets = await listMediaAssets(organization.id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Media library
        </h1>
        <p className="text-muted-foreground mt-1">
          Shared across every project in this workspace.
        </p>
      </div>
      <MediaLibraryClient projectId={projectId} initialAssets={assets} />
    </div>
  )
}
