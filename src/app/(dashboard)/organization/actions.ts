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
import { sendEmail } from '@/server/services/emailService'
import { teamInvitationEmail } from '@/server/email/templates'
import { env } from '@/lib/env'

export type OrgActionState =
  | {
      error?: string
      success?: string
      /**
       * Something the admin needs to know that is not a failure — chiefly that
       * the invitation exists but its email did not go out, so the link below
       * is the only way the recipient will hear about it.
       */
      warning?: string
      inviteUrl?: string
    }
  | undefined

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
 * Invites someone by email, and emails them.
 *
 * The link is returned for the admin to copy either way. Mail is the primary
 * channel but not a reliable one — a platform with no SMTP server configured
 * sends nothing at all, and a bounce is invisible from here — so the copyable
 * link stays as the fallback, and the caller is told plainly which of the two
 * actually happened rather than being shown "invitation sent" over a message
 * that never left.
 *
 * A send failure does not fail the action: the invitation is already stored and
 * the link already works, so reporting an error would be telling the admin that
 * nothing happened when something did.
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

  let inviteUrl: string
  let delivery: Awaited<ReturnType<typeof sendEmail>>

  try {
    const { organization, session } = await getActiveOrganization()
    const { token, email } = await inviteMember(organization.id, parsed.data)

    inviteUrl = `${env.AUTH_URL}/invitations/accept?token=${token}`

    const rendered = teamInvitationEmail({
      workspaceName: organization.name,
      inviterName: session.user.name ?? null,
      acceptUrl: inviteUrl,
      role: parsed.data.role,
    })

    delivery = await sendEmail({
      purpose: 'TEAM_INVITATION',
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/organization')

  if (delivery.status === 'SENT') {
    return {
      success: `Invitation sent to ${parsed.data.email}.`,
      inviteUrl,
    }
  }

  return {
    success: `Invitation created for ${parsed.data.email}.`,
    warning:
      delivery.status === 'SKIPPED'
        ? 'No email server is set up for invitations yet, so nothing was sent. Send them the link below.'
        : `The invitation email could not be sent (${delivery.error ?? 'unknown error'}). Send them the link below.`,
    inviteUrl,
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
