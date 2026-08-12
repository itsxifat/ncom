import { notFound } from 'next/navigation'
import { getTemplateForBuilder } from '@/server/services/templateService'
import { compileTemplateSections } from '@/server/services/templatePreviewScope'
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

  // Compiled here as well as in the builder shell, so the canvas paints the
  // real layout on first load instead of a gap that only fills in once the
  // parent posts its first update.
  const initialSections = await compileTemplateSections(
    template.sections.map((section) => ({
      id: section.id,
      order: section.order,
      content: section.defaultContent,
      config: section.defaultConfig,
      isVisible: section.isVisible,
      componentDefinition: {
        key: section.componentDefinition.key,
        renderMode: section.componentDefinition.renderMode,
        liquidSource: section.componentDefinition.liquidSource,
      },
    }))
  )

  return <CanvasClient initialTheme={theme} initialSections={initialSections} />
}
