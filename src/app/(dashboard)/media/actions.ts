'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  updateMediaAssetAltText,
  deleteMediaAsset,
} from '@/server/services/mediaService'

export async function updateAltTextAction(
  storeId: string,
  mediaId: string,
  altText: string
) {
  const { organization } = await getActiveOrganization()
  await updateMediaAssetAltText(organization.id, mediaId, altText)
  revalidatePath(`/media`)
}

export async function deleteMediaAssetAction(storeId: string, mediaId: string) {
  const { organization } = await getActiveOrganization()
  await deleteMediaAsset(organization.id, mediaId)
  revalidatePath(`/media`)
}
