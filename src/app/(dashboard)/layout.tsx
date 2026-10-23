import { getActiveOrganization } from '@/server/services/organizationService'
import { countOrdersNeedingAction } from '@/server/services/homeService'
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

  // Read when the layout renders — on load, on a refresh, and after any action
  // that revalidates the page — not on every client navigation, since layouts
  // persist across those. A number a few minutes behind is fine for a badge;
  // the order list it opens is always current.
  const ordersNeedingAction = await countOrdersNeedingAction(organization.id)

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
      ordersNeedingAction={ordersNeedingAction}
      signOutAction={signOutAction}
    >
      {children}
    </DashboardShell>
  )
}
