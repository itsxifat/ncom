'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db/client'
import { requireAuth } from '@/server/auth/rbac'
import { setActiveOrganizationCookie } from '@/server/services/organizationService'
import { signOut } from '@/server/auth/auth'

export async function switchOrganizationAction(organizationId: string) {
  const session = await requireAuth()

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: session.user.id, organizationId },
    },
  })
  if (!membership) throw new Error('You are not a member of that organization')

  await setActiveOrganizationCookie(organizationId)
  revalidatePath('/', 'layout')
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
