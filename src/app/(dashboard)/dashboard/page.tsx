import Link from 'next/link'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listProjects } from '@/server/services/projectService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const { session, organization } = await getActiveOrganization()
  const projects = await listProjects(organization.id)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back, {session.user.name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {organization.name} · {projects.length}{' '}
          {projects.length === 1 ? 'project' : 'projects'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {projects.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pages</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {projects.reduce((sum, p) => sum + p._count.pages, 0)}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Recent projects</h2>
        <Button render={<Link href="/projects/new" />} nativeButton={false}>
          New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            You don&apos;t have any projects yet.{' '}
            <Link href="/projects/new" className="text-foreground underline">
              Create your first one
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.slice(0, 6).map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:border-foreground/30 transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">{project.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  {project.subdomain}.ncom.app · {project._count.pages}{' '}
                  {project._count.pages === 1 ? 'page' : 'pages'}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
