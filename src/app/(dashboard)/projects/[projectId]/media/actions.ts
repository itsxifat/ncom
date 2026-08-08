'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  updateMediaAssetAltText,
  deleteMediaAsset,
} from '@/server/services/mediaService'

export async function updateAltTextAction(
  projectId: string,
  mediaId: string,
  altText: string
) {
  const { organization } = await getActiveOrganization()
  await updateMediaAssetAltText(organization.id, mediaId, altText)
  revalidatePath(`/projects/${projectId}/media`)
}

export async function deleteMediaAssetAction(
  projectId: string,
  mediaId: string
) {
  const { organization } = await getActiveOrganization()
  await deleteMediaAsset(organization.id, mediaId)
  revalidatePath(`/projects/${projectId}/media`)
}
