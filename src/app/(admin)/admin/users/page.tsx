import { auth } from '@/server/auth/auth'
import { listUsers } from '@/server/services/adminService'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Users
        </h1>
        <p className="text-muted-foreground mt-1">
          {users.length} {users.length === 1 ? 'user' : 'users'}
          {q ? ` matching "${q}"` : ''}.
        </p>
      </div>

      <form method="get" className="max-w-sm">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email"
        />
      </form>

      {users.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No users found.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
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
        </div>
      )}
    </div>
  )
}
