'use server'

import { getActiveOrganization } from '@/server/services/organizationService'
import { cropMediaAsset, listMediaAssets } from '@/server/services/mediaService'
import { cropRectSchema } from '@/lib/validation/media'

/** Used by ImagePicker's "Library" tab — works from both the page and template builders. */
export async function listAvailableMediaAction() {
  const { organization } = await getActiveOrganization()
  return listMediaAssets(organization.id)
}

/**
 * Stores the chosen region of an image as a new asset and hands back its URL.
 *
 * Returns the error as a value rather than throwing: this is called from a
 * dialog that has somewhere sensible to show "that image is not in your media
 * library", and an unhandled server-action rejection would surface in the
 * builder as a generic error overlay instead.
 */
export async function cropMediaAction(
  sourceUrl: string,
  rect: unknown
): Promise<{ url: string } | { error: string }> {
  const parsed = cropRectSchema.safeParse(rect)
  if (!parsed.success) return { error: 'That crop region is not valid' }

  const { organization } = await getActiveOrganization()
  try {
    const asset = await cropMediaAsset(organization.id, sourceUrl, parsed.data)
    return { url: asset.url }
  } catch (cause) {
    return {
      error:
        cause instanceof Error ? cause.message : 'Could not crop the image',
    }
  }
}
