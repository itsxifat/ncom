import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTemplateForPreview } from '@/server/services/templateService'
import { Button } from '@/components/ui/button'

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>
  searchParams: Promise<{ forProject?: string }>
}) {
  const { templateId } = await params
  const { forProject } = await searchParams

  let result
  try {
    result = await getTemplateForPreview(templateId)
  } catch {
    notFound()
  }
  const { template } = result

  const templateUseHref = forProject
    ? `/projects/${forProject}/pages/new?template=${templateId}`
    : `/projects/new?template=${templateId}`
  const backHref = forProject
    ? `/templates?forProject=${forProject}`
    : '/templates'

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={backHref} className="text-muted-foreground text-sm">
            ← Back to templates
          </Link>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">
            {template.name}
          </h1>
        </div>
        <Button render={<Link href={templateUseHref} />} nativeButton={false}>
          Use this template
        </Button>
      </div>
      <iframe
        src={`/preview-render/template/${template.id}`}
        title={`Preview of ${template.name}`}
        className="bg-card flex-1 rounded-lg border"
      />
    </div>
  )
}
