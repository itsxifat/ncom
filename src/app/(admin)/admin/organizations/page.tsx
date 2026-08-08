import Link from 'next/link'
import { listOrganizations } from '@/server/services/adminService'
import { Card, CardContent } from '@/components/ui/card'

export default async function AdminOrganizationsPage() {
  const organizations = await listOrganizations()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Organizations
        </h1>
        <p className="text-muted-foreground mt-1">
          {organizations.length}{' '}
          {organizations.length === 1 ? 'organization' : 'organizations'}.
        </p>
      </div>

      {organizations.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No organizations yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {organizations.map((organization) => (
            <Link
              key={organization.id}
              href={`/admin/organizations/${organization.id}`}
              className="hover:bg-accent flex items-center justify-between gap-4 px-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{organization.name}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {organization.slug}
                </p>
              </div>
              <p className="text-muted-foreground shrink-0 text-sm">
                {organization._count.memberships} members ·{' '}
                {organization._count.projects} projects
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
