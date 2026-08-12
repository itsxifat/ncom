import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTemplateForPreview } from '@/server/services/templateService'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>
  searchParams: Promise<{ forStore?: string }>
}) {
  const { templateId } = await params
  const { forStore } = await searchParams

  let result
  try {
    result = await getTemplateForPreview(templateId)
  } catch {
    notFound()
  }
  const { template } = result

  const templateUseHref = forStore
    ? `/stores/${forStore}/pages/new?template=${templateId}`
    : `/stores/new?template=${templateId}`
  const backHref = forStore ? `/templates?forStore=${forStore}` : '/templates'

  return (
    <div className="flex h-[calc(100svh-12rem)] min-h-125 flex-col gap-6">
      <PageHeader
        backHref={backHref}
        backLabel="Templates"
        eyebrow={template.category?.name ?? 'Uncategorized'}
        title={template.name}
        actions={
          <Button render={<Link href={templateUseHref} />} nativeButton={false}>
            Use this template
          </Button>
        }
      />
      <iframe
        src={`/preview-render/template/${template.id}`}
        title={`Preview of ${template.name}`}
        className="bg-card ring-foreground/6 shadow-panel flex-1 overflow-hidden rounded-xl ring-1"
      />
    </div>
  )
}
