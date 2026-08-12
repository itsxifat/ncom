import Link from 'next/link'
import { LayoutTemplate, Plus, Tags } from 'lucide-react'
import { listAllTemplatesForAdmin } from '@/server/services/templateService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { ArrowPuck } from '@/components/app/arrow-puck'
import { TemplateActionsMenu } from '@/components/admin/template-actions-menu'

const STATUS_VARIANT = {
  DRAFT: 'secondary',
  PUBLISHED: 'lime',
  ARCHIVED: 'outline',
} as const

export default async function AdminTemplatesPage() {
  const templates = await listAllTemplatesForAdmin()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Content"
        title="Templates"
        description="Curate the templates tenants can start a store from. Only published templates are visible to them."
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href="/admin/templates/categories" />}
              nativeButton={false}
            >
              <Tags />
              Categories
            </Button>
            <Button
              render={<Link href="/admin/templates/new" />}
              nativeButton={false}
            >
              <Plus />
              New template
            </Button>
          </>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          description="Create a template, build its sections, then publish it for tenants."
          action={
            <Button
              render={<Link href="/admin/templates/new" />}
              nativeButton={false}
            >
              <Plus />
              New template
            </Button>
          }
        />
      ) : (
        <div className="3xl:grid-cols-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="group/tile bg-card ring-foreground/6 shadow-puck hover:shadow-lift relative flex flex-col justify-between gap-8 rounded-xl p-5 ring-1 transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/templates/${template.id}/edit`}
                    className="font-display block truncate text-lg font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-xl"
                  >
                    {template.name}
                  </Link>
                  <p className="text-muted-foreground mt-1 truncate text-sm">
                    {template.category?.name ?? 'Uncategorized'} ·{' '}
                    {template._count.sections}{' '}
                    {template._count.sections === 1 ? 'section' : 'sections'}
                  </p>
                </div>
                <ArrowPuck />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={STATUS_VARIANT[template.status]}>
                  {template.status}
                </Badge>
                <div className="relative z-10 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <Link href={`/admin/templates/${template.id}/settings`} />
                    }
                    nativeButton={false}
                  >
                    Settings
                  </Button>
                  <TemplateActionsMenu templateId={template.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
