import { listAllProjects } from '@/server/services/adminService'
import { Card, CardContent } from '@/components/ui/card'
import { ProjectRow } from './ProjectRow'

export default async function AdminProjectsPage() {
  const projects = await listAllProjects()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Projects
        </h1>
        <p className="text-muted-foreground mt-1">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}{' '}
          across every tenant.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No projects yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              projectId={project.id}
              name={project.name}
              subdomain={project.subdomain}
              organizationName={project.organization.name}
              pageCount={project._count.pages}
            />
          ))}
        </div>
      )}
    </div>
  )
}
