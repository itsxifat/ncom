import { getTemplateForPreview } from '@/server/services/templateService'
import { NewProjectForm } from './NewProjectForm'

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>
}) {
  const { template: templateId } = await searchParams

  let templateName: string | undefined
  if (templateId) {
    try {
      const { template } = await getTemplateForPreview(templateId)
      templateName = template.name
    } catch {
      // Invalid or unpublished template id — fall back to a blank project.
    }
  }

  return (
    <NewProjectForm
      templateId={templateName ? templateId : undefined}
      templateName={templateName}
    />
  )
}
