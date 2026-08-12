import { getTemplateForPreview } from '@/server/services/templateService'
import { env } from '@/lib/env'
import { NewStoreForm } from './NewStoreForm'

export default async function NewStorePage({
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
      // Invalid or unpublished template id — fall back to a blank store.
    }
  }

  return (
    <NewStoreForm
      templateId={templateName ? templateId : undefined}
      templateName={templateName}
      rootDomain={env.ROOT_DOMAIN}
    />
  )
}
