import 'server-only'
import { auth } from '@/server/auth/auth'
import { currentMachineActor } from '@/server/auth/actor'
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
 *
 * Also satisfied by an API key acting for that organisation — see
 * server/auth/actor.ts. The key's scopes were already checked at the route
 * boundary, and they are finer-grained than org roles, so the check here is
 * only that the key belongs to the organisation being read or written. That
 * one comparison is what stops a valid key for tenant A from reaching tenant
 * B's data by passing an id it does not own.
 */
export async function requireOrgAccess(
  organizationId: string,
  minRole: OrgRole = 'VIEWER'
): Promise<{ session: Session | null; role: OrgRole }> {
  const machine = currentMachineActor()
  if (machine) {
    if (
      machine.organizationId !== organizationId ||
      !hasMinRole(machine.role, minRole)
    ) {
      throw new AuthorizationError('This API key cannot access that data')
    }
    // Null rather than a fabricated session: a machine actor is not a person,
    // and inventing a user id here would silently attribute its writes to
    // whoever happened to create the key.
    return { session: null, role: machine.role }
  }

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

/**
 * `requireOrgAccess` for operations that must record *who* performed them —
 * publishing a page, inviting a colleague, refunding an order.
 *
 * An API key can be authorised to do a thing without being a person who can be
 * held to it, and writing a key's action into a field meaning "the user who did
 * this" would put a fiction in the audit trail. These operations therefore
 * refuse machine actors outright rather than attributing their work to the
 * human who happened to create the key.
 */
export async function requireHumanOrgAccess(
  organizationId: string,
  minRole: OrgRole = 'VIEWER'
): Promise<{ session: Session; role: OrgRole }> {
  const { session, role } = await requireOrgAccess(organizationId, minRole)

  if (!session) {
    throw new AuthorizationError(
      'This action has to be performed by a signed-in user, not an API key'
    )
  }

  return { session, role }
}
