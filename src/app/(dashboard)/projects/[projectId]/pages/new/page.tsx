import { getTemplateForPreview } from '@/server/services/templateService'
import { NewPageForm } from './NewPageForm'

export default async function NewPagePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const { projectId } = await params
  const { template: templateId } = await searchParams

  let templateName: string | undefined
  if (templateId) {
    try {
      const { template } = await getTemplateForPreview(templateId)
      templateName = template.name
    } catch {
      // Invalid or unpublished template id — fall back to a blank page.
    }
  }

  return (
    <NewPageForm
      projectId={projectId}
      templateId={templateName ? templateId : undefined}
      templateName={templateName}
    />
  )
}
