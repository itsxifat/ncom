'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  savePageSections,
  type SectionSaveInput,
} from '@/server/services/pageService'

export async function saveSectionsAction(
  storeId: string,
  pageId: string,
  sections: SectionSaveInput[]
): Promise<{ idMapping: Record<string, string> }> {
  const { organization } = await getActiveOrganization()
  const idMapping = await savePageSections(
    organization.id,
    storeId,
    pageId,
    sections
  )
  revalidatePath(`/stores/${storeId}/pages/${pageId}/preview`)
  return { idMapping }
}
