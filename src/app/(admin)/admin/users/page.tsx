import { Search, Users } from 'lucide-react'
import { auth } from '@/server/auth/auth'
import { listUsers } from '@/server/services/adminService'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { ListPanel } from '@/components/app/list-panel'
import { UserRow } from './UserRow'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const session = await auth()
  const users = await listUsers(q)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description={`${users.length} ${users.length === 1 ? 'user' : 'users'}${q ? ` matching “${q}”` : ''}.`}
        actions={
          <form method="get" className="relative w-full sm:w-80">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by name or email"
              aria-label="Search users"
              className="pl-10"
            />
          </form>
        }
      />

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description={
            q
              ? 'Nothing matched that search. Try a different name or email.'
              : 'Users appear here once someone registers.'
          }
        />
      ) : (
        <ListPanel>
          {users.map((user) => (
            <UserRow
              key={user.id}
              userId={user.id}
              name={user.name}
              email={user.email}
              platformRole={user.platformRole}
              isSuspended={user.isSuspended}
              membershipCount={user._count.memberships}
              isSelf={user.id === session?.user.id}
            />
          ))}
        </ListPanel>
      )}
    </div>
  )
}
