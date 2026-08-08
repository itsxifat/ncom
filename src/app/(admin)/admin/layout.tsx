import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/server/auth/auth'

const NAV_ITEMS = [
  { href: '/admin/templates', label: 'Templates' },
  { href: '/admin/templates/categories', label: 'Categories' },
]

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
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-base font-semibold tracking-tight">
            NCOM Admin
          </span>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm font-medium"
        >
          ← Back to dashboard
        </Link>
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
