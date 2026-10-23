import { getActiveOrganization } from '@/server/services/organizationService'
import {
  listInvitations,
  listMembers,
} from '@/server/services/invitationService'
import { hasMinRole } from '@/server/auth/rbac'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { TeamManager } from '@/components/dashboard/team-manager'
import { OrganizationForm } from '@/components/dashboard/organization-form'

export default async function OrganizationPage() {
  const { organization, role, session } = await getActiveOrganization()

  const canManage = hasMinRole(role, 'ADMIN')

  const [members, invitations] = await Promise.all([
    listMembers(organization.id),
    // Only admins may see pending invitations — the list is a roster of who is
    // being brought in, which is not viewer-level information.
    canManage ? listInvitations(organization.id) : Promise.resolve([]),
  ])

  return (
    <PageShell>
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Team"
        description={`The people who work in ${organization.name}, and what the workspace is called.`}
      />

      <SettingsSection
        title="Details"
        description="What this workspace is called."
      >
        <OrganizationForm
          key={organization.name}
          name={organization.name}
          canEdit={canManage}
        />
      </SettingsSection>

      <TeamManager
        canManage={canManage}
        members={members.map((membership) => ({
          userId: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
          isYou: membership.user.id === session.user.id,
        }))}
        invitations={invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt.toLocaleDateString(),
        }))}
      />
    </PageShell>
  )
}
