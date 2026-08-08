import { getActiveOrganization } from '@/server/services/organizationService'
import { signOutAction } from '@/app/(dashboard)/actions'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, organization, memberships } = await getActiveOrganization()

  const initials =
    session.user.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? session.user.email?.[0]?.toUpperCase()

  return (
    <DashboardShell
      organizationId={organization.id}
      organizations={memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
      }))}
      isPlatformAdmin={session.user.platformRole === 'SUPER_ADMIN'}
      userName={session.user.name}
      userEmail={session.user.email}
      initials={initials}
      signOutAction={signOutAction}
    >
      {children}
    </DashboardShell>
  )
}
