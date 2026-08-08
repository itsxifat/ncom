import { notFound } from 'next/navigation'
import { getTemplateForBuilder } from '@/server/services/templateService'
import { CanvasClient } from '@/modules/builder/CanvasFrame'

export default async function TemplateCanvasPage({
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

  const initialSections = template.sections.map((section) => ({
    id: section.id,
    order: section.order,
    content: section.defaultContent,
    config: section.defaultConfig,
    isVisible: section.isVisible,
    componentDefinition: { key: section.componentDefinition.key },
  }))

  return <CanvasClient initialTheme={theme} initialSections={initialSections} />
}
