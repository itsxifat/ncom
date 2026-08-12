import { Globe } from 'lucide-react'
import { listPublishedPagesForModeration } from '@/server/services/adminService'
import { env } from '@/lib/env'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { ListPanel } from '@/components/app/list-panel'
import { PublishedPageRow } from './PublishedPageRow'

export default async function AdminPublishedPagesPage() {
  const pages = await listPublishedPagesForModeration()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Content"
        title="Published pages"
        description={`${pages.length} live ${pages.length === 1 ? 'page' : 'pages'} across every tenant.`}
      />

      {pages.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="Nothing published yet"
          description="Pages show up here the moment a tenant publishes them."
        />
      ) : (
        <ListPanel>
          {pages.map((page) => (
            <PublishedPageRow
              key={page.id}
              pageId={page.id}
              title={page.title}
              url={`${page.store.subdomain}.${env.ROOT_DOMAIN}${page.isHome ? '' : `/${page.slug}`}`}
              organizationName={page.store.organization.name}
              publishedAt={page.publishedAt?.toISOString() ?? null}
            />
          ))}
        </ListPanel>
      )}
    </div>
  )
}
