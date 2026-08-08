'use server'

import { revalidatePath } from 'next/cache'
import {
  upsertPlatformSetting,
  deletePlatformSetting,
} from '@/server/services/adminService'
import { upsertPlatformSettingSchema } from '@/lib/validation/platform-setting'

export type SettingFormState = { error?: string } | undefined

export async function upsertPlatformSettingAction(
  _prevState: SettingFormState,
  formData: FormData
): Promise<SettingFormState> {
  const parsed = upsertPlatformSettingSchema.safeParse({
    key: formData.get('key'),
    value: formData.get('value'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  let value: unknown
  try {
    value = JSON.parse(parsed.data.value)
  } catch {
    return { error: 'Value must be valid JSON (e.g. "text", 123, true, {})' }
  }

  await upsertPlatformSetting(parsed.data.key, value)
  revalidatePath('/admin/settings')
  return { error: undefined }
}

export async function deletePlatformSettingAction(key: string) {
  await deletePlatformSetting(key)
  revalidatePath('/admin/settings')
}
