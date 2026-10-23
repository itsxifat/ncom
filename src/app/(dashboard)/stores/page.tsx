import Link from 'next/link'
import {
  ExternalLink,
  LayoutGrid,
  Package,
  PanelTop,
  Pencil,
  Plus,
  Store as StoreIcon,
} from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listStores } from '@/server/services/storeService'
import { getRecentPageStats, listPages } from '@/server/services/pageService'
import { env } from '@/lib/env'
import { TONE_STYLES } from '@/lib/order-status-colors'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StoreActionsMenu } from '@/components/dashboard/store-actions-menu'
import { PageActionsMenu } from '@/components/dashboard/page-actions-menu'
import { PageStatusBadge } from '@/components/dashboard/page-status-badge'

type Page = Awaited<ReturnType<typeof listPages>>[number]

/**
 * Every website in the workspace — online stores and landing pages — with
 * their pages laid out under each.
 *
 * The two kinds are different things to the merchant, and the list says which
 * is which: a landing page is one page with an order form, so its strip and
 * its page are nearly the same thing; an online store has its own pages plus
 * the two designs every product and category is drawn with, listed apart so
 * nobody goes looking for "Product page" in their menu.
 */
export default async function WebsitesPage() {
  const { organization } = await getActiveOrganization()
  const stores = await listStores(organization.id)

  if (stores.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Make your first website
          </h2>
          <p className="text-muted-foreground">
            Pick the kind you need, then choose a ready-made design. You can
            make more of either later.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <KindCard
            href="/stores/new?kind=STORE"
            icon={StoreIcon}
            title="Online store"
            text="A full shop: categories, a page for every product, cart, checkout and customer accounts."
          />
          <KindCard
            href="/stores/new?kind=LANDING"
            icon={PanelTop}
            title="Landing page"
            text="One page that sells one product, a combo or a category, with an order form right on it."
          />
        </div>
      </div>
    )
  }

  const [pagesByStore, stats] = await Promise.all([
    Promise.all(stores.map((store) => listPages(organization.id, store.id))),
    getRecentPageStats(organization.id),
  ])

  return (
    <div className="flex flex-col gap-10">
      {stores.map((store, index) => {
        const pages = pagesByStore[index]!
        const host = `${store.subdomain}.${env.ROOT_DOMAIN}`
        const home = pages.find((page) => page.isHome)
        const isLive = home?.status === 'PUBLISHED'
        const isStore = store.kind === 'STORE'
        const own = pages.filter((page) => page.role === 'STANDARD')
        const designs = pages.filter(
          (page) => page.role === 'PRODUCT' || page.role === 'CATALOG'
        )
        const Icon = isStore ? StoreIcon : PanelTop

        return (
          <section
            key={store.id}
            aria-labelledby={`store-${store.id}`}
            className="flex flex-col gap-4"
          >
            <div className="bg-card ring-border flex flex-wrap items-center gap-3 rounded-xl p-4 ring-1">
              <span className="bg-lime text-ink flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id={`store-${store.id}`}
                  className="flex items-center gap-2 truncate text-base font-semibold"
                >
                  {store.name}
                  <span className="text-muted-foreground text-xs font-medium">
                    {isStore ? 'Online store' : 'Landing page'}
                  </span>
                </h2>
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span className="truncate">{host}</span>
                  <Badge
                    className={TONE_STYLES[isLive ? 'green' : 'none'].pill}
                  >
                    {isLive ? 'Live' : 'Not live yet'}
                  </Badge>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {home && (
                  <Button
                    render={
                      <Link
                        href={`/stores/${store.id}/pages/${home.id}/edit`}
                      />
                    }
                    nativeButton={false}
                  >
                    <Pencil />
                    Edit {isStore ? 'store' : 'page'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  render={<Link href={`/stores/${store.id}/settings`} />}
                  nativeButton={false}
                >
                  Settings
                </Button>
                {isLive && (
                  <Button
                    variant="outline"
                    render={
                      <a
                        href={`http://${host}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    Visit
                    <ExternalLink />
                  </Button>
                )}
                <StoreActionsMenu storeId={store.id} />
              </div>
            </div>

            <div className="3xl:grid-cols-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {own.map((page) => (
                <PageCard
                  key={page.id}
                  storeId={store.id}
                  host={host}
                  page={page}
                  week={stats.get(page.id)}
                />
              ))}

              {isStore && (
                <Link
                  href={`/stores/${store.id}/pages/new`}
                  className="border-input hover:border-foreground/40 flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed p-6 text-center transition-colors"
                >
                  <span className="bg-lime text-lime-foreground flex size-10 items-center justify-center rounded-full">
                    <Plus className="size-4.5" />
                  </span>
                  <span className="font-semibold">Add a page</span>
                  <span className="text-muted-foreground max-w-60 text-sm">
                    About us, contact, delivery and returns — already written
                    for you.
                  </span>
                </Link>
              )}
            </div>

            {designs.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  <span className="text-foreground font-semibold">
                    Shop pages
                  </span>{' '}
                  — designed once, used for every product and every category.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {designs.map((page) => (
                    <Link
                      key={page.id}
                      href={`/stores/${store.id}/pages/${page.id}/edit`}
                      className="bg-card ring-border hover:ring-foreground/25 flex items-center gap-3 rounded-xl p-4 ring-1 transition"
                    >
                      <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                        {page.role === 'PRODUCT' ? (
                          <Package className="size-4.5" />
                        ) : (
                          <LayoutGrid className="size-4.5" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">
                          {page.role === 'PRODUCT'
                            ? 'Product page'
                            : 'Category page'}
                        </span>
                        <span className="text-muted-foreground truncate text-sm">
                          {page.role === 'PRODUCT'
                            ? 'How each of your products looks'
                            : 'Categories, search results and all products'}
                        </span>
                      </span>
                      <Pencil className="text-muted-foreground size-4" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function PageCard({
  storeId,
  host,
  page,
  week,
}: {
  storeId: string
  host: string
  page: Page
  week?: { visits: number; orders: number }
}) {
  const path = page.isHome ? '/' : `/${page.slug}`
  return (
    <article className="bg-card ring-border flex flex-col gap-3 rounded-xl p-5 ring-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{page.title}</h3>
          <p className="text-muted-foreground truncate text-sm">
            {path}
            {page.isHome && ' · Home page'}
          </p>
        </div>
        <PageStatusBadge status={page.status} />
      </div>

      <p className="text-muted-foreground text-sm">
        {page.status === 'PUBLISHED'
          ? `Last 7 days · ${(week?.visits ?? 0).toLocaleString('en-US')} visits · ${week?.orders ?? 0} ${week?.orders === 1 ? 'order' : 'orders'}`
          : 'Not published yet — only you can see it.'}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          className="flex-1"
          render={<Link href={`/stores/${storeId}/pages/${page.id}/edit`} />}
          nativeButton={false}
        >
          <Pencil />
          Edit
        </Button>
        {page.status === 'PUBLISHED' ? (
          <Button
            variant="outline"
            className="flex-1"
            render={
              <a
                href={`http://${host}${page.isHome ? '' : path}`}
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
          >
            View
          </Button>
        ) : (
          <Button
            variant="outline"
            className="flex-1"
            render={
              <Link href={`/stores/${storeId}/pages/${page.id}/preview`} />
            }
            nativeButton={false}
          >
            Preview
          </Button>
        )}
        <PageActionsMenu
          storeId={storeId}
          pageId={page.id}
          status={page.status}
          previewToken={page.previewToken}
        />
      </div>
    </article>
  )
}

function KindCard({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string
  icon: typeof StoreIcon
  title: string
  text: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'bg-card ring-border hover:ring-foreground/30 flex items-start gap-4 rounded-2xl p-6 ring-1 transition'
      )}
    >
      <span className="bg-lime text-ink flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{title}</span>
        <span className="text-muted-foreground text-sm">{text}</span>
      </span>
    </Link>
  )
}
