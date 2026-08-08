'use server'

import { revalidatePath } from 'next/cache'
import {
  saveTemplateSections,
  type TemplateSectionSaveInput,
} from '@/server/services/templateService'

export async function saveTemplateSectionsAction(
  templateId: string,
  sections: TemplateSectionSaveInput[]
): Promise<{ idMapping: Record<string, string> }> {
  const idMapping = await saveTemplateSections(templateId, sections)
  revalidatePath(`/templates/${templateId}/preview`)
  return { idMapping }
}
