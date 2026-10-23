import { getActiveOrganization } from '@/server/services/organizationService'
import { listMediaAssets } from '@/server/services/mediaService'
import { MediaLibraryClient } from './MediaLibraryClient'

/**
 * The image library, shared by every website in the workspace. Its title and
 * tabs come from the Pages section layout.
 */
export default async function MediaLibraryPage() {
  const { organization } = await getActiveOrganization()
  const assets = await listMediaAssets(organization.id)

  return <MediaLibraryClient initialAssets={assets} />
}
