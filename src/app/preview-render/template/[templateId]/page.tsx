import { notFound } from 'next/navigation'
import { getTemplateForPreview } from '@/server/services/templateService'
import { compileTemplateSections } from '@/server/services/templatePreviewScope'
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

  // Compiled against sample data: a template has no store, so its commerce
  // sections have nothing real to quote. Without this every Liquid section in
  // the gallery preview rendered as an empty gap.
  const sections = await compileTemplateSections(
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

  return <PageRenderer theme={theme} sections={sections} />
}
