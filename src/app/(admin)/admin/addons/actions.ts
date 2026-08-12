'use server'

import { revalidatePath } from 'next/cache'
import { addonFormSchema } from '@/lib/validation/plan'
import { deleteAddon, upsertAddon } from '@/server/services/planAdminService'

export type AddonFormState =
  | { error?: string; fieldErrors?: Record<string, string>; saved?: boolean }
  | undefined

export async function saveAddonAction(
  addonId: string | null,
  _prevState: AddonFormState,
  formData: FormData
): Promise<AddonFormState> {
  const parsed = addonFormSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    // Multi-value fields have to be read with getAll — `Object.fromEntries`
    // keeps only the last value, which would silently reduce a five-plan
    // selection to one.
    planIds: formData.getAll('planIds').map(String),
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: 'Check the highlighted fields.', fieldErrors }
  }

  try {
    await upsertAddon(addonId, parsed.data)
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message.includes('Unique constraint')
          ? 'An add-on with that code already exists.'
          : error instanceof Error
            ? error.message
            : 'Could not save the add-on.',
    }
  }

  revalidatePath('/admin/addons')
  return { saved: true }
}

export async function deleteAddonAction(
  addonId: string
): Promise<{ error?: string }> {
  try {
    await deleteAddon(addonId)
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not delete the add-on.',
    }
  }

  revalidatePath('/admin/addons')
  return {}
}
