import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/server/db/client'
import {
  requireAuth,
  requireOrgAccess,
  requireHumanOrgAccess,
} from '@/server/auth/rbac'
import {
  requireQuota,
  requireSeatForInvitation,
} from '@/server/services/entitlementService'
import type { OrgRole } from '@/generated/prisma/enums'

/**
 * Organisation invitations.
 *
 * An invite is addressed to an email, not to a user, because the person being
 * invited usually does not have an account yet. It carries a single-use token
 * whose SHA-256 hash is what gets stored — a leaked database therefore yields
 * no usable invitation links.
 *
 * Accepting is bound to the signed-in user's email, not to whoever holds the
 * link. That closes the obvious hole: a forwarded invite must not let a
 * stranger into someone else's organisation.
 */

const INVITE_TTL_DAYS = 14

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Roles an inviter may hand out.
 *
 * You cannot grant a role above your own — otherwise an ADMIN could invite a
 * new OWNER and then be removed by them, which is privilege escalation with
 * extra steps.
 */
const ROLE_RANK: Record<OrgRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
}

export async function listInvitations(organizationId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  return prisma.orgInvitation.findMany({
    where: { organizationId, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listMembers(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.membership.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function inviteMember(
  organizationId: string,
  input: { email: string; role: OrgRole }
): Promise<{ token: string; email: string }> {
  const { role: inviterRole } = await requireOrgAccess(organizationId, 'ADMIN')

  if (ROLE_RANK[input.role] > ROLE_RANK[inviterRole]) {
    throw new Error('You cannot grant a role higher than your own')
  }

  const email = input.email.trim().toLowerCase()

  const existingMember = await prisma.membership.findFirst({
    where: { organizationId, user: { email } },
    select: { id: true },
  })
  if (existingMember) throw new Error('That person is already a member')

  // Seats are counted as members + outstanding invitations, so five invitations
  // cannot each individually look like they fit a one-seat plan. Re-inviting
  // someone who already has a pending invitation does not consume a new seat,
  // because the upsert below replaces that row rather than adding one.
  const alreadyInvited = await prisma.orgInvitation.findUnique({
    where: { organizationId_email: { organizationId, email } },
    select: { acceptedAt: true, expiresAt: true },
  })
  const isReinvite =
    alreadyInvited !== null &&
    alreadyInvited.acceptedAt === null &&
    alreadyInvited.expiresAt > new Date()

  if (!isReinvite) {
    await requireQuota(organizationId, 'TEAM_MEMBERS')
  }

  const token = randomBytes(32).toString('hex')

  await prisma.orgInvitation.upsert({
    where: { organizationId_email: { organizationId, email } },
    create: {
      organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    // Re-inviting reissues the token rather than erroring, which is what
    // "resend invite" means to the person clicking it.
    update: {
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      acceptedAt: null,
    },
  })

  return { token, email }
}

export async function revokeInvitation(
  organizationId: string,
  invitationId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const invitation = await prisma.orgInvitation.findFirst({
    where: { id: invitationId, organizationId },
    select: { id: true },
  })
  if (!invitation) throw new Error('Invitation not found')

  await prisma.orgInvitation.delete({ where: { id: invitationId } })
}

/**
 * Accepts an invitation for the signed-in user.
 *
 * The invite's email must match the account accepting it. Without that check a
 * forwarded or intercepted link would be a way into any organisation.
 */
export async function acceptInvitation(token: string) {
  const session = await requireAuth()

  const invitation = await prisma.orgInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!invitation) throw new Error('That invitation link is not valid')
  if (invitation.acceptedAt)
    throw new Error('That invitation has already been used')
  if (invitation.expiresAt < new Date())
    throw new Error('That invitation has expired')

  const userEmail = session.user.email?.toLowerCase() ?? ''
  const inviteEmail = invitation.email.toLowerCase()

  const a = Buffer.from(userEmail)
  const b = Buffer.from(inviteEmail)
  const emailMatches = a.length === b.length && timingSafeEqual(a, b)

  if (!emailMatches) {
    throw new Error(
      `This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`
    )
  }

  // Re-checked at acceptance, not only at invitation: an invite sent when a seat
  // was free can be clicked a week later, after the seat was filled. The invitee
  // sees the refusal, which is unhelpful for them but correct — the alternative
  // is a workspace silently over its plan.
  //
  // Someone who is somehow already a member takes no new seat, so the check is
  // skipped rather than failed — refusing them would be refusing entry to a
  // workspace they are already in.
  const existingMembership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: session.user.id,
        organizationId: invitation.organizationId,
      },
    },
    select: { id: true },
  })

  if (!existingMembership) {
    await requireSeatForInvitation(invitation.organizationId, invitation.id)
  }

  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: invitation.organizationId,
        },
      },
      create: {
        userId: session.user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
      update: {},
      select: { organizationId: true },
    })

    await tx.orgInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })

    return membership
  })
}

export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: OrgRole
) {
  const { session, role: actorRole } = await requireHumanOrgAccess(
    organizationId,
    'ADMIN'
  )

  if (ROLE_RANK[role] > ROLE_RANK[actorRole]) {
    throw new Error('You cannot grant a role higher than your own')
  }

  if (userId === session.user.id) {
    throw new Error('You cannot change your own role')
  }

  const target = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  })
  if (!target) throw new Error('That person is not a member')

  // Demoting someone above you is the same escalation risk as promoting past
  // yourself, in reverse.
  if (ROLE_RANK[target.role] > ROLE_RANK[actorRole]) {
    throw new Error('You cannot change the role of someone above you')
  }

  await assertNotLastOwner(organizationId, userId, role)

  return prisma.membership.update({
    where: { userId_organizationId: { userId, organizationId } },
    data: { role },
  })
}

export async function removeMember(organizationId: string, userId: string) {
  const { session, role: actorRole } = await requireHumanOrgAccess(
    organizationId,
    'ADMIN'
  )

  if (userId === session.user.id) {
    throw new Error('You cannot remove yourself')
  }

  const target = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  })
  if (!target) throw new Error('That person is not a member')

  if (ROLE_RANK[target.role] > ROLE_RANK[actorRole]) {
    throw new Error('You cannot remove someone above you')
  }

  await assertNotLastOwner(organizationId, userId, null)

  await prisma.membership.delete({
    where: { userId_organizationId: { userId, organizationId } },
  })
}

/**
 * Refuses to leave an organisation with no owner.
 *
 * An ownerless organisation is unrecoverable through the UI: nobody can invite,
 * promote, or delete anything, and the stores inside it are stranded.
 */
async function assertNotLastOwner(
  organizationId: string,
  userId: string,
  newRole: OrgRole | null
) {
  const current = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  })
  if (current?.role !== 'OWNER') return
  if (newRole === 'OWNER') return

  const owners = await prisma.membership.count({
    where: { organizationId, role: 'OWNER' },
  })
  if (owners <= 1) {
    throw new Error(
      'This is the only owner — promote someone else to owner first'
    )
  }
}
