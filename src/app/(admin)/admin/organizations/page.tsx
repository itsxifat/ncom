import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { listOrganizations } from '@/server/services/adminService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { ListPanel } from '@/components/app/list-panel'
import { ArrowPuck } from '@/components/app/arrow-puck'

export default async function AdminOrganizationsPage() {
  const organizations = await listOrganizations()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform"
        title="Organizations"
        description={`${organizations.length} ${organizations.length === 1 ? 'tenant' : 'tenants'} on this installation.`}
      />

      {organizations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          description="An organization is created for each user on their first sign-in."
        />
      ) : (
        <ListPanel>
          {organizations.map((organization) => (
            <Link
              key={organization.id}
              href={`/admin/organizations/${organization.id}`}
              className="group/tile hover:bg-muted/50 flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{organization.name}</p>
                <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                  {organization.slug}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <p className="text-muted-foreground text-sm">
                  {organization._count.memberships} members ·{' '}
                  {organization._count.stores} stores
                </p>
                <ArrowPuck />
              </div>
            </Link>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
