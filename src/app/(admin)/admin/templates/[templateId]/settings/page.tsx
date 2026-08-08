import { notFound } from 'next/navigation'
import {
  getTemplateForBuilder,
  listTemplateCategories,
} from '@/server/services/templateService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeForm } from '@/components/dashboard/theme-form'
import { TemplateMetaForm } from './TemplateMetaForm'
import { DeleteTemplateButton } from './DeleteTemplateButton'
import { updateTemplateThemeAction } from './actions'

export default async function TemplateSettingsPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

  let result
  try {
    result = await getTemplateForBuilder(templateId)
  } catch {
    notFound()
  }
  const { template, theme } = result

  const categories = await listTemplateCategories()

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Template settings
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateMetaForm
            templateId={templateId}
            name={template.name}
            description={template.description}
            categoryId={template.categoryId}
            status={template.status}
            categories={categories}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default styling</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeForm
            key={template.updatedAt.toISOString()}
            action={updateTemplateThemeAction.bind(null, templateId)}
            theme={theme}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive text-base">
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteTemplateButton templateId={templateId} />
        </CardContent>
      </Card>
    </div>
  )
}
