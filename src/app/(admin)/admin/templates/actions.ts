'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  createTemplate,
  deleteTemplate,
} from '@/server/services/templateService'
import { createTemplateSchema } from '@/lib/validation/template'
import type { FormActionState } from '@/app/(dashboard)/projects/actions'

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
