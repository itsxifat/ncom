import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BarChart3,
  ExternalLink,
  FileText,
  Globe,
  Palette,
  Plus,
} from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getStore, getStoreIntegration } from '@/server/services/storeService'
import { listPages } from '@/server/services/pageService'
import { env } from '@/lib/env'
import { StatCard } from '@/components/app/stat-card'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const STATUS_VARIANT = {
  PUBLISHED: 'lime',
  DRAFT: 'secondary',
  UNPUBLISHED: 'outline',
} as const

/**
 * The store overview.
 *
 * A store is a website, so this reports on the website: how many pages exist,
 * how many are actually reachable, and whether the tracking that measures them
 * is configured. Revenue, orders, products and customers are workspace figures
 * shared by every store — they live on /dashboard and the Sell section, and
 * repeating them per store would state a per-store number that does not exist.
 */
export default async function StoreOverviewPage({
  params,
}: PageProps<'/stores/[storeId]'>) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()

  let store
  try {
    store = await getStore(organization.id, storeId)
  } catch {
    notFound()
  }

  const [pages, integration] = await Promise.all([
    listPages(organization.id, storeId),
    getStoreIntegration(organization.id, storeId),
  ])

  const base = `/stores/${storeId}`
  const origin = `http://${store.subdomain}.${env.ROOT_DOMAIN}`

  const published = pages.filter((page) => page.status === 'PUBLISHED')
  const home = pages.find((page) => page.isHome)
  // The live address only answers if the home page is published — the public
  // renderer serves the home page for `/`, and 404s when it is not live.
  const isLive = home?.status === 'PUBLISHED'

  const trackers = [
    integration?.gaMeasurementId && 'GA',
    integration?.gtmContainerId && 'GTM',
    integration?.metaPixelId && 'Meta Pixel',
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone={isLive ? 'lime' : 'ink'}
          label="Storefront"
          value={isLive ? 'Live' : 'Offline'}
          hint={
            isLive
              ? `${store.subdomain}.${env.ROOT_DOMAIN}`
              : 'Publish the home page to go live'
          }
          icon={<Globe />}
        />
        <StatCard label="Pages" value={pages.length} icon={<FileText />} />
        <StatCard
          label="Published"
          value={published.length}
          hint={`${pages.length - published.length} not live`}
          icon={<ExternalLink />}
        />
        <StatCard
          label="Tracking"
          value={trackers.length}
          hint={trackers.length > 0 ? trackers.join(' · ') : 'None configured'}
          icon={<BarChart3 />}
        />
      </div>

      {!isLive && pages.length > 0 && (
        <div className="bg-card ring-foreground/6 shadow-puck flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4 ring-1">
          <div>
            <p className="font-medium">This store is not live yet</p>
            <p className="text-muted-foreground text-sm">
              {home
                ? `Its home page is ${home.status.toLowerCase()}, so ${store.subdomain}.${env.ROOT_DOMAIN} returns a 404.`
                : `This store has no home page, so ${store.subdomain}.${env.ROOT_DOMAIN} returns a 404.`}
            </p>
          </div>
          {home && (
            <Button
              size="sm"
              render={<Link href={`${base}/pages/${home.id}/edit`} />}
              nativeButton={false}
            >
              Publish home page
            </Button>
          )}
        </div>
      )}

      {pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No pages yet"
          description="Add a page, drop sections onto it, and publish when it's ready."
          action={
            <Button
              render={<Link href={`${base}/pages/new`} />}
              nativeButton={false}
            >
              <Plus />
              New page
            </Button>
          }
        />
      ) : (
        <ListPanel>
          <ListPanelHeader>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Pages
            </h2>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`${base}/pages`} />}
              nativeButton={false}
            >
              All pages
            </Button>
          </ListPanelHeader>

          {pages.slice(0, 8).map((page) => (
            <ListRow key={page.id}>
              <ListRowText
                title={
                  <Link
                    href={`${base}/pages/${page.id}/edit`}
                    className="hover:underline"
                  >
                    {page.title}
                  </Link>
                }
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
                        href={`${origin}${page.isHome ? '' : `/${page.slug}`}`}
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
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`${base}/theme`}
          className="bg-card ring-foreground/6 shadow-puck hover:ring-foreground/12 flex items-center gap-3 rounded-xl px-5 py-4 ring-1 transition"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-black/6">
            <Palette className="size-4" />
          </span>
          <div>
            <p className="font-medium">Design</p>
            <p className="text-muted-foreground text-sm">
              Colours, type and the storefront templates
            </p>
          </div>
        </Link>
        <Link
          href={`${base}/settings`}
          className="bg-card ring-foreground/6 shadow-puck hover:ring-foreground/12 flex items-center gap-3 rounded-xl px-5 py-4 ring-1 transition"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-black/6">
            <BarChart3 className="size-4" />
          </span>
          <div>
            <p className="font-medium">Domain &amp; tracking</p>
            <p className="text-muted-foreground text-sm">
              Subdomain, analytics and pixels
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}
