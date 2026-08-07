import Link from 'next/link'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listProjects } from '@/server/services/projectService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectActionsMenu } from '@/components/dashboard/project-actions-menu'

export default async function ProjectsPage() {
  const { organization } = await getActiveOrganization()
  const projects = await listProjects(organization.id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button render={<Link href="/projects/new" />} nativeButton={false}>
          New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No projects yet.{' '}
            <Link href="/projects/new" className="text-foreground underline">
              Create your first landing page project
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover:border-foreground/30 transition-colors"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <Link
                  href={`/projects/${project.id}`}
                  className="min-w-0 flex-1"
                >
                  <CardTitle className="truncate text-base">
                    {project.name}
                  </CardTitle>
                </Link>
                <ProjectActionsMenu projectId={project.id} />
              </CardHeader>
              <Link href={`/projects/${project.id}`}>
                <CardContent className="text-muted-foreground text-sm">
                  {project.subdomain}.ncom.app · {project._count.pages}{' '}
                  {project._count.pages === 1 ? 'page' : 'pages'}
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
