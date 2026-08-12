import { getActiveOrganization } from '@/server/services/organizationService'
import { signOutAction } from '@/app/(dashboard)/actions'
import { requireVerifiedEmail } from '@/server/auth/emailGate'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, organization, memberships } = await getActiveOrganization()

  // Every dashboard route renders through this layout, so gating here covers
  // all of them — including ones added later, which is the point.
  await requireVerifiedEmail(session.user.id)

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
