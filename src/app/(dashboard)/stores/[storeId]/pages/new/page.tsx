import { getTemplateForPreview } from '@/server/services/templateService'
import { NewPageForm } from './NewPageForm'

export default async function NewPagePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const { storeId } = await params
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
      storeId={storeId}
      templateId={templateName ? templateId : undefined}
      templateName={templateName}
    />
  )
}
