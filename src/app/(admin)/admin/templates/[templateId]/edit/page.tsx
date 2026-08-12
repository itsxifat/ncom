import { notFound } from 'next/navigation'
import { getTemplateForBuilder } from '@/server/services/templateService'
import { prisma } from '@/server/db/client'
import { BuilderShell } from '@/modules/builder/BuilderShell'
import { listGlobalLiquidSections } from '@/server/services/liquidService'
import {
  renderTemplateSectionPreviewAction,
  saveTemplateSectionsAction,
} from './actions'

export default async function TemplateEditPage({
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

  const componentDefinitions = await prisma.componentDefinition.findMany({
    where: { isActive: true },
  })
  const componentDefinitionIds = Object.fromEntries(
    componentDefinitions.map((c) => [c.key, c.id])
  )

  // Liquid sections have to be declared here or the canvas has no idea they
  // need compiling — it looks them up in the React registry, finds nothing and
  // paints an empty div where the section should be.
  const liquidSections = await listGlobalLiquidSections()

  const initialSections = template.sections.map((section) => ({
    id: section.id,
    componentDefinitionId: section.componentDefinitionId,
    sectionKey: section.componentDefinition.key,
    order: section.order,
    content: section.defaultContent as Record<string, unknown>,
    config: (section.defaultConfig ?? {}) as Record<string, unknown>,
    isVisible: section.isVisible,
  }))

  return (
    <BuilderShell
      entityId={templateId}
      backHref="/admin/templates"
      title={template.name}
      theme={theme}
      initialSections={initialSections}
      componentDefinitionIds={componentDefinitionIds}
      liquidSections={liquidSections}
      renderSection={renderTemplateSectionPreviewAction.bind(null, templateId)}
      canvasSrc={`/builder-canvas/template/${templateId}`}
      onSave={saveTemplateSectionsAction.bind(null, templateId)}
    />
  )
}
