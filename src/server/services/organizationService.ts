import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/server/db/client'
import { requireAuth } from '@/server/auth/rbac'

const ACTIVE_ORG_COOKIE = 'ncom_active_org'

export async function listMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Resolves which organization the current dashboard request is scoped to:
 * the cookie's org if the user is still a member of it, otherwise their
 * first membership. Redirects to login if there is no session, and to
 * /projects (which will itself redirect to onboarding) if the user somehow
 * has no memberships at all.
 */
export async function getActiveOrganization() {
  const session = await requireAuth()
  const memberships = await listMemberships(session.user.id)

  if (memberships.length === 0) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value

  const active =
    memberships.find((m) => m.organizationId === activeOrgId) ?? memberships[0]

  return {
    session,
    organization: active.organization,
    role: active.role,
    memberships,
  }
}

export async function setActiveOrganizationCookie(organizationId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}
