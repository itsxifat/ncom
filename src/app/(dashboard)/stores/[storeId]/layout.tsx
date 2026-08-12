import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getStore } from '@/server/services/storeService'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PillTabs } from '@/components/app/pill-tabs'

/**
 * The store shell.
 *
 * A store is a website: a subdomain, the pages on it, how they look, and the
 * domain it answers on. Products, inventory, orders and customers deliberately
 * are not here — they belong to the workspace and are shared by every store, so
 * putting them under one store would imply a separation that does not exist.
 *
 * Deliberately a compact bar rather than a full PageHeader: this renders on
 * every route beneath it, including pages that carry their own title and back
 * link, and two stacked headers is noise.
 */
export default async function StoreLayout({
  children,
  params,
}: LayoutProps<'/stores/[storeId]'>) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()

  let store
  try {
    store = await getStore(organization.id, storeId)
  } catch {
    notFound()
  }

  // The public renderer serves the home page for `/` and 404s unless it is
  // PUBLISHED, so "View store" is only a working link when it is — otherwise
  // the button sends the user to a 404 with no explanation of why.
  const home = await prisma.page.findFirst({
    where: { storeId, isHome: true },
    select: { status: true },
  })
  const isLive = home?.status === 'PUBLISHED'

  const base = `/stores/${storeId}`
  const liveUrl = `http://${store.subdomain}.${env.ROOT_DOMAIN}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/stores"
            className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="size-4" />
            Stores
          </Link>
          <h1 className="font-display truncate text-2xl leading-tight font-semibold tracking-tight">
            {store.name}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <span className="truncate">
              {store.subdomain}.{env.ROOT_DOMAIN}
            </span>
            <Badge variant={isLive ? 'lime' : 'outline'}>
              {isLive ? 'Live' : 'Not published'}
            </Badge>
          </p>
        </div>

        {isLive ? (
          <Button
            variant="outline"
            render={<a href={liveUrl} target="_blank" rel="noreferrer" />}
            nativeButton={false}
          >
            <ExternalLink />
            View store
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <ExternalLink />
            View store
          </Button>
        )}
      </div>

      <PillTabs
        items={[
          { href: base, label: 'Home' },
          { href: `${base}/pages`, label: 'Pages' },
          { href: `${base}/theme`, label: 'Design' },
          { href: `${base}/settings`, label: 'Settings' },
        ]}
      />

      {children}
    </div>
  )
}
