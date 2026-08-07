import { getActiveOrganization } from '@/server/services/organizationService'
import { signOutAction } from '@/app/(dashboard)/actions'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import { SidebarNav } from '@/components/dashboard/sidebar-nav'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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
    <div className="grid flex-1 grid-cols-[16rem_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground flex flex-col gap-6 border-r px-4 py-6">
        <div className="flex items-center gap-2 px-1">
          <span className="font-display text-lg font-semibold tracking-tight">
            NCOM
          </span>
        </div>

        <OrgSwitcher
          activeOrgId={organization.id}
          organizations={memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
          }))}
        />

        <SidebarNav />

        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {session.user.name ?? session.user.email}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {session.user.email}
              </p>
            </div>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
