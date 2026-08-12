'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  getActiveOrganization,
  updateOrganization,
} from '@/server/services/organizationService'
import {
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from '@/server/services/invitationService'
import { env } from '@/lib/env'

export type OrgActionState =
  { error?: string; success?: string; inviteUrl?: string } | undefined

const roleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'])

function fail(cause: unknown): OrgActionState {
  return {
    error: cause instanceof Error ? cause.message : 'Something went wrong',
  }
}

export async function updateOrganizationAction(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const parsed = z
    .object({ name: z.string().trim().min(2).max(100) })
    .safeParse({ name: formData.get('name') })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a name' }
  }

  try {
    const { organization } = await getActiveOrganization()
    await updateOrganization(organization.id, parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/organization')
  return { success: 'Workspace updated.' }
}

/**
 * Invites someone by email.
 *
 * Returns the invite URL for the admin to copy. There is no transactional
 * email yet, so surfacing the link is the difference between a working invite
 * flow and a dead end — when email lands, this keeps working as a fallback for
 * when it does not arrive.
 */
export async function inviteMemberAction(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const parsed = z.object({ email: z.email(), role: roleSchema }).safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the invitation' }
  }

  let token: string
  try {
    const { organization } = await getActiveOrganization()
    const result = await inviteMember(organization.id, parsed.data)
    token = result.token
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/organization')
  return {
    success: `Invitation created for ${parsed.data.email}.`,
    inviteUrl: `${env.AUTH_URL}/invitations/accept?token=${token}`,
  }
}

export async function revokeInvitationAction(
  invitationId: string
): Promise<OrgActionState> {
  try {
    const { organization } = await getActiveOrganization()
    await revokeInvitation(organization.id, invitationId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/organization')
  return { success: 'Invitation revoked.' }
}

export async function updateMemberRoleAction(
  userId: string,
  role: string
): Promise<OrgActionState> {
  const parsed = roleSchema.safeParse(role)
  if (!parsed.success) return { error: 'Unknown role' }

  try {
    const { organization } = await getActiveOrganization()
    await updateMemberRole(organization.id, userId, parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/organization')
  return { success: 'Role updated.' }
}

export async function removeMemberAction(
  userId: string
): Promise<OrgActionState> {
  try {
    const { organization } = await getActiveOrganization()
    await removeMember(organization.id, userId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/organization')
  return { success: 'Member removed.' }
}
