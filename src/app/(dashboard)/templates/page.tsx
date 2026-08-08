import Link from 'next/link'
import { listPublishedTemplates } from '@/server/services/templateService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ forProject?: string }>
}) {
  const { forProject } = await searchParams
  const templates = await listPublishedTemplates()

  const templateUseHref = (templateId: string) =>
    forProject
      ? `/projects/${forProject}/pages/new?template=${templateId}`
      : `/projects/new?template=${templateId}`

  const templatePreviewHref = (templateId: string) =>
    `/templates/${templateId}/preview${forProject ? `?forProject=${forProject}` : ''}`

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Templates
        </h1>
        <p className="text-muted-foreground mt-1">
          {forProject
            ? 'Pick a template to seed a new page.'
            : 'Pick a template to start a new project.'}
        </p>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No templates are published yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <div className="from-muted to-card border-b bg-gradient-to-br">
                <div className="text-muted-foreground/40 flex h-32 items-center justify-center text-4xl font-semibold">
                  {template.name.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <CardHeader>
                <CardTitle className="text-base">{template.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-xs tracking-wide uppercase">
                    {template.category?.name ?? 'Uncategorized'}
                  </p>
                  {template.description && (
                    <p className="text-muted-foreground mt-2 text-sm">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={templatePreviewHref(template.id)} />}
                    nativeButton={false}
                  >
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    render={<Link href={templateUseHref(template.id)} />}
                    nativeButton={false}
                  >
                    Use template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
