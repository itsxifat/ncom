import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrganizationDetail } from '@/server/services/adminService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params

  let organization
  try {
    organization = await getOrganizationDetail(organizationId)
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/organizations"
          className="text-muted-foreground text-sm"
        >
          ← Back to organizations
        </Link>
        <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">
          {organization.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {organization.slug}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y p-0">
          {organization.memberships.map((membership) => (
            <div
              key={membership.id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {membership.user.name ?? membership.user.email}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {membership.user.email}
                </p>
              </div>
              <Badge variant="outline">{membership.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projects</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y p-0">
          {organization.projects.length === 0 && (
            <p className="text-muted-foreground px-6 py-4 text-sm">
              No projects.
            </p>
          )}
          {organization.projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{project.name}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {project.subdomain}.ncom.app
                </p>
              </div>
              <p className="text-muted-foreground shrink-0 text-sm">
                {project._count.pages}{' '}
                {project._count.pages === 1 ? 'page' : 'pages'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
