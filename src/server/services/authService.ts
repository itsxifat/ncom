import 'server-only'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { BCRYPT_COST } from '@/lib/security'
import type { RegisterInput } from '@/lib/validation/auth'

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super('An account with this email already exists')
    this.name = 'EmailAlreadyInUseError'
  }
}

async function uniqueOrgSlug(base: string): Promise<string> {
  const baseSlug = slugify(base) || 'workspace'

  const existing = await prisma.organization.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique organization slug')
}

/**
 * Creates a User, a default personal Organization, and an OWNER Membership
 * in one transaction. Does not sign the user in — callers do that separately.
 */
export async function registerUser({ name, email, password }: RegisterInput) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existingUser) {
    throw new EmailAlreadyInUseError()
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  const orgSlug = await uniqueOrgSlug(name)

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash },
    })

    const organization = await tx.organization.create({
      data: { name: `${name}'s Workspace`, slug: orgSlug },
    })

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'OWNER',
      },
    })

    return user
  })
}
