import { redirect } from 'next/navigation'
import { auth } from '@/server/auth/auth'
import { requireVerifiedEmail } from '@/server/auth/emailGate'
import { AdminShell } from '@/components/admin/admin-shell'

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

  await requireVerifiedEmail(session.user.id)

  return <AdminShell>{children}</AdminShell>
}
