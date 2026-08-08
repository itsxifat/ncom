'use server'

import { revalidatePath } from 'next/cache'
import {
  setUserPlatformRole,
  setUserSuspended,
} from '@/server/services/adminService'
import type { PlatformRole } from '@/generated/prisma/enums'

export async function setUserPlatformRoleAction(
  userId: string,
  role: PlatformRole
) {
  await setUserPlatformRole(userId, role)
  revalidatePath('/admin/users')
}

export async function setUserSuspendedAction(
  userId: string,
  isSuspended: boolean
) {
  await setUserSuspended(userId, isSuspended)
  revalidatePath('/admin/users')
}
