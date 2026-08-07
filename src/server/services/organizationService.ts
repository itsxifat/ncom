import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/server/db/client'
import { requireAuth } from '@/server/auth/rbac'

const ACTIVE_ORG_COOKIE = 'ncom_active_org'

/**
 * Resolves which organization the current dashboard request is scoped to:
 * the cookie's org if the caller is still a member of it, otherwise their
 * first membership. Always derives the user from a freshly-verified
 * session — never takes a userId parameter — so it can only ever return
 * the caller's own memberships. Redirects to login if there is no session,
 * and back to login if the user somehow has no memberships at all.
 */
export async function getActiveOrganization() {
  const session = await requireAuth()

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  })

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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}
