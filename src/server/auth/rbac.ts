import 'server-only'
import { auth } from '@/server/auth/auth'
import { prisma } from '@/server/db/client'
import type { OrgRole } from '@/generated/prisma/enums'
import type { Session } from 'next-auth'

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
}

export function hasMinRole(role: OrgRole, minRole: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[minRole]
}

/** Throws if there is no authenticated session. Returns the session otherwise. */
export async function requireAuth(): Promise<Session> {
  const session = await auth()
  if (!session?.user) {
    throw new AuthorizationError('Authentication required')
  }
  return session
}

/** Throws unless the current user is a platform SUPER_ADMIN. */
export async function requirePlatformAdmin(): Promise<Session> {
  const session = await requireAuth()
  if (session.user.platformRole !== 'SUPER_ADMIN') {
    throw new AuthorizationError('Platform admin access required')
  }
  return session
}

/**
 * Throws unless the current user has at least `minRole` membership in
 * `organizationId`. Every tenant-scoped server action/route handler should
 * call this before touching data for that organization.
 */
export async function requireOrgAccess(
  organizationId: string,
  minRole: OrgRole = 'VIEWER'
): Promise<{ session: Session; role: OrgRole }> {
  const session = await requireAuth()

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: session.user.id,
        organizationId,
      },
    },
  })

  if (!membership || !hasMinRole(membership.role, minRole)) {
    throw new AuthorizationError('You do not have access to this organization')
  }

  return { session, role: membership.role }
}
