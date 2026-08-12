'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  updateTemplateMeta,
  updateTemplateTheme,
  deleteTemplate,
} from '@/server/services/templateService'
import { updateTemplateMetaSchema } from '@/lib/validation/template'
import { updateThemeSchema, type ThemeFormState } from '@/lib/validation/theme'
import type { FormActionState } from '@/app/(dashboard)/stores/actions'

export async function updateTemplateMetaAction(
  templateId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = updateTemplateMetaSchema.safeParse({
    name: formData.get('name'),
    categoryId: formData.get('categoryId') || undefined,
    description: formData.get('description') || undefined,
    status: formData.get('status'),
    isPremium: formData.get('isPremium') ?? undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    await updateTemplateMeta(templateId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/admin/templates/${templateId}/settings`)
  revalidatePath('/admin/templates')
  return { error: undefined }
}

export async function updateTemplateThemeAction(
  templateId: string,
  _prevState: ThemeFormState,
  formData: FormData
): Promise<ThemeFormState> {
  const parsed = updateThemeSchema.safeParse({
    primaryColor: formData.get('primaryColor'),
    secondaryColor: formData.get('secondaryColor'),
    backgroundColor: formData.get('backgroundColor'),
    textColor: formData.get('textColor'),
    headingFont: formData.get('headingFont'),
    bodyFont: formData.get('bodyFont'),
    buttonStyle: formData.get('buttonStyle'),
    borderRadius: formData.get('borderRadius'),
    spacingScale: formData.get('spacingScale'),
    containerWidth: formData.get('containerWidth'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  await updateTemplateTheme(templateId, parsed.data)

  revalidatePath(`/admin/templates/${templateId}/settings`)
  return { success: 'Theme updated.' }
}

export async function deleteTemplateAction(templateId: string) {
  await deleteTemplate(templateId)
  revalidatePath('/admin/templates')
  redirect('/admin/templates')
}
