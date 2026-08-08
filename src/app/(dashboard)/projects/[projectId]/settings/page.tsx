import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getProject,
  getProjectIntegration,
} from '@/server/services/projectService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectSettingsForm } from '@/components/dashboard/project-settings-form'
import { IntegrationForm } from '@/components/dashboard/integration-form'

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

  const integration = await getProjectIntegration(organization.id, projectId)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Project settings
      </h1>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationForm
            key={integration?.updatedAt.toISOString()}
            projectId={project.id}
            gaMeasurementId={integration?.gaMeasurementId ?? null}
            gtmContainerId={integration?.gtmContainerId ?? null}
            metaPixelId={integration?.metaPixelId ?? null}
            customHeadScript={integration?.customHeadScript ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
