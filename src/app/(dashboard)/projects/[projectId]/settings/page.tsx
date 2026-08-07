import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getProject } from '@/server/services/projectService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectSettingsForm } from '@/components/dashboard/project-settings-form'

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { organization } = await getActiveOrganization()

  let project
  try {
    project = await getProject(organization.id, projectId)
  } catch {
    notFound()
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Project settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectSettingsForm
            key={`${project.name}-${project.subdomain}`}
            projectId={project.id}
            name={project.name}
            subdomain={project.subdomain}
          />
        </CardContent>
      </Card>
    </div>
  )
}
