import 'server-only'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
import { requireAuth } from '@/server/auth/rbac'
import { BCRYPT_COST } from '@/lib/security'
import type {
  UpdateProfileInput,
  ChangePasswordInput,
} from '@/lib/validation/user'

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super('Current password is incorrect')
    this.name = 'InvalidCurrentPasswordError'
  }
}

/**
 * Always acts on the caller's own account — derives the user id from a
 * freshly-verified session rather than trusting a passed-in id, so this
 * can never be called on someone else's account even by a future mistake.
 */
export async function updateProfile(input: UpdateProfileInput) {
  const session = await requireAuth()
  return prisma.user.update({
    where: { id: session.user.id },
    data: { name: input.name },
  })
}

export async function changePassword(input: ChangePasswordInput) {
  const session = await requireAuth()
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
  })

  if (!user.passwordHash) {
    throw new InvalidCurrentPasswordError()
  }

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!isValid) {
    throw new InvalidCurrentPasswordError()
  }

  const newPasswordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newPasswordHash },
  })
}
