'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  createTemplate,
  deleteTemplate,
  importTemplateLiquid,
} from '@/server/services/templateService'
import { createTemplateSchema } from '@/lib/validation/template'
import type { FormActionState } from '@/app/(dashboard)/stores/actions'

export type TemplateUploadState =
  { error?: string; success?: string } | undefined

export async function createTemplateAction(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createTemplateSchema.safeParse({
    name: formData.get('name'),
    categoryId: formData.get('categoryId') || undefined,
    description: formData.get('description') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  let template
  try {
    template = await createTemplate(parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath('/admin/templates')
  redirect(`/admin/templates/${template.id}/edit`)
}

export async function deleteTemplateAction(templateId: string) {
  await deleteTemplate(templateId)
  revalidatePath('/admin/templates')
}

/**
 * Uploads a full-page Liquid design onto a template.
 *
 * Validation lives in the service and its message (with a line number) is
 * surfaced verbatim — an admin pasting a theme needs to know which line broke,
 * not that "something went wrong".
 */
export async function importTemplateLiquidAction(
  templateId: string,
  _prev: TemplateUploadState,
  formData: FormData
): Promise<TemplateUploadState> {
  const source = String(formData.get('source') ?? '').trim()
  if (!source) return { error: 'Paste the Liquid for this design' }

  try {
    await importTemplateLiquid(templateId, source)
  } catch (cause) {
    return {
      error:
        cause instanceof Error ? cause.message : 'Could not save the design',
    }
  }

  revalidatePath(`/admin/templates/${templateId}/settings`)
  return { success: 'Design uploaded and available to merchants.' }
}
