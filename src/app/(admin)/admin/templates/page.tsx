import Link from 'next/link'
import { listAllTemplatesForAdmin } from '@/server/services/templateService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TemplateActionsMenu } from '@/components/admin/template-actions-menu'

const STATUS_VARIANT = {
  DRAFT: 'secondary',
  PUBLISHED: 'default',
  ARCHIVED: 'outline',
} as const

export default async function AdminTemplatesPage() {
  const templates = await listAllTemplatesForAdmin()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Templates
          </h1>
          <p className="text-muted-foreground mt-1">
            Curate the templates tenants can start a project from.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/admin/templates/categories" />}
            nativeButton={false}
          >
            Categories
          </Button>
          <Button
            render={<Link href="/admin/templates/new" />}
            nativeButton={false}
          >
            New template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            No templates yet.{' '}
            <Link
              href="/admin/templates/new"
              className="text-foreground underline"
            >
              Create the first one
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="hover:border-foreground/30 transition-colors"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <Link
                  href={`/admin/templates/${template.id}/edit`}
                  className="min-w-0 flex-1"
                >
                  <CardTitle className="truncate text-base">
                    {template.name}
                  </CardTitle>
                </Link>
                <TemplateActionsMenu templateId={template.id} />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="text-muted-foreground text-sm">
                  {template.category?.name ?? 'Uncategorized'} ·{' '}
                  {template._count.sections}{' '}
                  {template._count.sections === 1 ? 'section' : 'sections'}
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant={STATUS_VARIANT[template.status]}>
                    {template.status}
                  </Badge>
                  <div className="flex gap-3 text-sm">
                    <Link
                      href={`/admin/templates/${template.id}/edit`}
                      className="hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/templates/${template.id}/settings`}
                      className="hover:underline"
                    >
                      Settings
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
