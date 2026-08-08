'use server'

import { getActiveOrganization } from '@/server/services/organizationService'
import { listMediaAssets } from '@/server/services/mediaService'

/** Used by ImagePicker's "Library" tab — works from both the page and template builders. */
export async function listAvailableMediaAction() {
  const { organization } = await getActiveOrganization()
  return listMediaAssets(organization.id)
}
