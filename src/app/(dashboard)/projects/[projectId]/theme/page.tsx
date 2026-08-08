import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getProjectTheme } from '@/server/services/projectService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeForm } from '@/components/dashboard/theme-form'
import { updateThemeAction } from './actions'

export default async function ProjectThemePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { organization } = await getActiveOrganization()

  let theme
  try {
    theme = await getProjectTheme(organization.id, projectId)
  } catch {
    notFound()
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display mb-6 text-3xl font-semibold tracking-tight">
        Theme
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global styling</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeForm
            key={theme.updatedAt.toISOString()}
            action={updateThemeAction.bind(null, projectId)}
            theme={theme}
          />
        </CardContent>
      </Card>
    </div>
  )
}
