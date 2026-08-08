import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/server/auth/auth'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // proxy.ts already gates /admin at the edge by JWT platformRole; this is
  // the DB-truth check behind it, so a role downgrade takes effect
  // immediately instead of waiting for the JWT to expire.
  if (!session?.user) redirect('/login')
  if (session.user.platformRole !== 'SUPER_ADMIN') redirect('/dashboard')

  return (
    <div className="grid flex-1 grid-cols-[16rem_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground flex flex-col gap-6 border-r px-4 py-6">
        <div className="flex items-center gap-2 px-1">
          <span className="font-display text-lg font-semibold tracking-tight">
            NCOM Admin
          </span>
        </div>
        <AdminSidebarNav />
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground mt-auto text-sm font-medium"
        >
          ← Back to dashboard
        </Link>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
