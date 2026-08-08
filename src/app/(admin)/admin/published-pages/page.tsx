import { listPublishedPagesForModeration } from '@/server/services/adminService'
import { Card, CardContent } from '@/components/ui/card'
import { PublishedPageRow } from './PublishedPageRow'

export default async function AdminPublishedPagesPage() {
  const pages = await listPublishedPagesForModeration()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Published pages
        </h1>
        <p className="text-muted-foreground mt-1">
          {pages.length} live {pages.length === 1 ? 'page' : 'pages'} across
          every tenant.
        </p>
      </div>

      {pages.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            Nothing published yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {pages.map((page) => (
            <PublishedPageRow
              key={page.id}
              pageId={page.id}
              title={page.title}
              url={`${page.project.subdomain}.ncom.app${page.isHome ? '' : `/${page.slug}`}`}
              organizationName={page.project.organization.name}
              publishedAt={page.publishedAt?.toISOString() ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
