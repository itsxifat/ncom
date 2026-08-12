'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import { saveStorefrontTemplate } from '@/server/services/liquidService'
import { publishStorefrontTemplate } from '@/server/services/organizationSettingsService'
import type { StoreActionState } from '@/app/(dashboard)/commerce-actions'

/**
 * Storefront template actions.
 *
 * Save and publish stay separate: saving writes the draft, publishing copies it
 * into the column the storefront reads. Collapsing them would put every
 * half-finished edit live.
 */

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function fail(cause: unknown): StoreActionState {
  return {
    error: cause instanceof Error ? cause.message : 'Something went wrong',
  }
}

export async function saveTemplateAction(
  storeId: string,
  templateId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  try {
    await saveStorefrontTemplate(
      await org(),
      storeId,
      templateId,
      String(formData.get('source') ?? '')
    )
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/stores/${storeId}/code`)
  return { success: 'Saved as draft.' }
}

export async function publishTemplateAction(
  storeId: string,
  templateId: string
): Promise<StoreActionState> {
  try {
    await publishStorefrontTemplate(await org(), templateId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/stores/${storeId}/code`)
  return { success: 'Published — this is now live on your storefront.' }
}
