import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, FileText, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getStore } from '@/server/services/storeService'
import { listPages } from '@/server/services/pageService'
import { env } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { PageActionsMenu } from '@/components/dashboard/page-actions-menu'

const STATUS_VARIANT = {
  PUBLISHED: 'lime',
  DRAFT: 'secondary',
  UNPUBLISHED: 'outline',
} as const

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()

  let store
  try {
    store = await getStore(organization.id, storeId)
  } catch {
    notFound()
  }

  const pages = await listPages(organization.id, storeId)

  return (
    <div className="flex flex-col gap-8">
      {/* No back link, title or eyebrow here: the store layout above already
          renders all three, and Design/Settings are in its tab bar. Media is
          a workspace library at /media, not a per-store route. */}
      <PageHeader
        title="Pages"
        description={`${pages.length} ${pages.length === 1 ? 'page' : 'pages'} in this store.`}
        actions={
          <Button
            render={<Link href={`/stores/${store.id}/pages/new`} />}
            nativeButton={false}
          >
            <Plus />
            New page
          </Button>
        }
      />

      {pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No pages yet"
          description="Add a page, drop sections onto it, and publish when it's ready."
          action={
            <Button
              render={<Link href={`/stores/${store.id}/pages/new`} />}
              nativeButton={false}
            >
              <Plus />
              New page
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {pages.map((page) => (
            <ListRow key={page.id}>
              <ListRowText
                title={page.title}
                meta={`/${page.isHome ? '' : page.slug}`}
                badges={
                  <>
                    {page.isHome && <Badge variant="outline">Home</Badge>}
                    <Badge variant={STATUS_VARIANT[page.status]}>
                      {page.status}
                    </Badge>
                  </>
                }
              />
              <ListRowActions>
                {page.status === 'PUBLISHED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <a
                        href={`http://${store.subdomain}.${env.ROOT_DOMAIN}${page.isHome ? '' : `/${page.slug}`}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <ExternalLink />
                    View live
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      href={`/stores/${store.id}/pages/${page.id}/preview`}
                    />
                  }
                  nativeButton={false}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  render={
                    <Link href={`/stores/${store.id}/pages/${page.id}/edit`} />
                  }
                  nativeButton={false}
                >
                  Edit
                </Button>
                <PageActionsMenu
                  storeId={store.id}
                  pageId={page.id}
                  status={page.status}
                  previewToken={page.previewToken}
                />
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
