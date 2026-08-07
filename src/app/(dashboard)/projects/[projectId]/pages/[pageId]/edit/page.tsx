import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getPageWithSections } from '@/server/services/pageService'
import { prisma } from '@/server/db/client'
import { BuilderShell } from '@/modules/builder/BuilderShell'

export default async function PageEditPage({
  params,
}: {
  params: Promise<{ projectId: string; pageId: string }>
}) {
  const { projectId, pageId } = await params
  const { organization } = await getActiveOrganization()

  let page
  try {
    page = await getPageWithSections(organization.id, projectId, pageId)
  } catch {
    notFound()
  }

  if (!page.project.theme) {
    notFound()
  }

  const componentDefinitions = await prisma.componentDefinition.findMany({
    where: { isActive: true },
  })
  const componentDefinitionIds = Object.fromEntries(
    componentDefinitions.map((c) => [c.key, c.id])
  )

  const initialSections = page.sections.map((section) => ({
    id: section.id,
    componentDefinitionId: section.componentDefinitionId,
    sectionKey: section.componentDefinition.key,
    order: section.order,
    content: section.content as Record<string, unknown>,
    config: (section.config ?? {}) as Record<string, unknown>,
    isVisible: section.isVisible,
  }))

  return (
    <BuilderShell
      projectId={projectId}
      pageId={pageId}
      pageTitle={page.title}
      theme={page.project.theme}
      initialSections={initialSections}
      componentDefinitionIds={componentDefinitionIds}
    />
  )
}
