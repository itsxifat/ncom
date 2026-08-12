import { LayoutTemplate } from 'lucide-react'
import { listPublishedTemplates } from '@/server/services/templateService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { TemplateTile } from '@/components/dashboard/template-tile'

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ forStore?: string }>
}) {
  const { forStore } = await searchParams
  const templates = await listPublishedTemplates()

  const templateUseHref = (templateId: string) =>
    forStore
      ? `/stores/${forStore}/pages/new?template=${templateId}`
      : `/stores/new?template=${templateId}`

  const templatePreviewHref = (templateId: string) =>
    `/templates/${templateId}/preview${forStore ? `?forStore=${forStore}` : ''}`

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Gallery"
        title="Templates"
        description={
          forStore
            ? 'Pick a template to seed a new page.'
            : 'Pick a template to start a new store.'
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates published yet"
          description="Published templates show up here for everyone in the workspace."
        />
      ) : (
        <div className="3xl:grid-cols-5 4xl:grid-cols-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {templates.map((template) => (
            <TemplateTile
              key={template.id}
              name={template.name}
              categoryName={template.category?.name ?? 'Uncategorized'}
              description={template.description}
              sectionCount={template._count.sections}
              previewHref={templatePreviewHref(template.id)}
              useHref={templateUseHref(template.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
