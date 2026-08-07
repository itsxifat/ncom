'use server'

import { revalidatePath } from 'next/cache'
import {
  updateProfile,
  changePassword,
  InvalidCurrentPasswordError,
} from '@/server/services/userService'
import {
  updateProfileSchema,
  changePasswordSchema,
} from '@/lib/validation/user'

export type FormActionState = { error?: string; success?: string } | undefined
export type ProfileActionState =
  { error?: string; success?: string; name?: string } | undefined

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const parsed = updateProfileSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const updated = await updateProfile(parsed.data)

  revalidatePath('/account/profile')
  revalidatePath('/', 'layout')
  return { success: 'Profile updated.', name: updated.name ?? undefined }
}

export async function changePasswordAction(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    await changePassword(parsed.data)
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) {
      return { error: error.message }
    }
    throw error
  }

  return { success: 'Password changed.' }
}
