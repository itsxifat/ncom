'use server'

import { revalidatePath } from 'next/cache'
import {
  createTemplateCategory,
  toggleTemplateCategoryActive,
  deleteTemplateCategory,
} from '@/server/services/templateService'
import { createTemplateCategorySchema } from '@/lib/validation/template'
import type { FormActionState } from '@/app/(dashboard)/projects/actions'

export async function createTemplateCategoryAction(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createTemplateCategorySchema.safeParse({
    name: formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    await createTemplateCategory(parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath('/admin/templates/categories')
  return { error: undefined }
}

export async function toggleTemplateCategoryActiveAction(categoryId: string) {
  await toggleTemplateCategoryActive(categoryId)
  revalidatePath('/admin/templates/categories')
}

export async function deleteTemplateCategoryAction(categoryId: string) {
  await deleteTemplateCategory(categoryId)
  revalidatePath('/admin/templates/categories')
}
