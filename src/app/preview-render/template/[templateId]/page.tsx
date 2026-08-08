import { notFound } from 'next/navigation'
import { getTemplateForPreview } from '@/server/services/templateService'
import { PageRenderer } from '@/modules/sections/PageRenderer'

export default async function TemplatePreviewRenderPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

  let result
  try {
    result = await getTemplateForPreview(templateId)
  } catch {
    notFound()
  }

  const { template, theme } = result

  const sections = template.sections.map((section) => ({
    id: section.id,
    order: section.order,
    content: section.defaultContent,
    config: section.defaultConfig,
    isVisible: section.isVisible,
    componentDefinition: { key: section.componentDefinition.key },
  }))

  return <PageRenderer theme={theme} sections={sections} />
}
