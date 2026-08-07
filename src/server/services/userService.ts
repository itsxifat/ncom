import 'server-only'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
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

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: input.name },
  })
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (!user.passwordHash) {
    throw new InvalidCurrentPasswordError()
  }

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!isValid) {
    throw new InvalidCurrentPasswordError()
  }

  const newPasswordHash = await bcrypt.hash(input.newPassword, 10)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash },
  })
}
