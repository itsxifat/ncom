import Link from 'next/link'
import { FolderKanban, LayoutTemplate, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listStores } from '@/server/services/storeService'
import { env } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { ArrowPuck } from '@/components/app/arrow-puck'
import { EmptyState } from '@/components/app/empty-state'
import { StoreTile } from '@/components/dashboard/store-tile'

export default async function DashboardPage() {
  const { session, organization } = await getActiveOrganization()
  const stores = await listStores(organization.id)
  const pageCount = stores.reduce((sum, p) => sum + p._count.pages, 0)

  return (
    <div className="flex flex-col gap-8 2xl:gap-10">
      <PageHeader
        eyebrow={organization.name}
        title={`Welcome back, ${session.user.name?.split(' ')[0] ?? 'there'}`}
        description="Everything you've built in this workspace, and the fastest way to add the next thing."
        actions={
          <Button render={<Link href="/stores/new" />} nativeButton={false}>
            <Plus />
            New store
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="lime"
          label="Stores"
          value={stores.length}
          hint={`in ${organization.name}`}
          icon={<FolderKanban />}
        />
        <StatCard
          label="Pages"
          value={pageCount}
          hint="across every store"
          icon={<LayoutTemplate />}
        />
        <Link
          href="/templates"
          className="group/tile bg-ink text-ink-foreground shadow-puck hover:shadow-lift relative flex min-h-32 flex-col justify-between gap-6 overflow-hidden rounded-xl p-5 transition-shadow xl:col-span-2 2xl:min-h-36 2xl:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="eyebrow opacity-60">Templates</span>
            <ArrowPuck className="bg-white/10 text-white ring-white/15" />
          </div>
          <div>
            <p className="font-display max-w-sm text-2xl leading-tight font-semibold tracking-tight text-balance 2xl:text-3xl">
              Start from a template instead of a blank page
            </p>
            <p className="mt-2 text-sm opacity-60">
              Pick a layout, swap the copy, publish.
            </p>
          </div>
        </Link>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Recent stores
          </h2>
          {stores.length > 6 && (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/stores" />}
              nativeButton={false}
            >
              View all {stores.length}
            </Button>
          )}
        </div>

        {stores.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No stores yet"
            description="A store holds your pages, media, and theme. Create one to get started."
            action={
              <Button render={<Link href="/stores/new" />} nativeButton={false}>
                <Plus />
                New store
              </Button>
            }
          />
        ) : (
          <div className="3xl:grid-cols-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {stores.slice(0, 6).map((store) => (
              <StoreTile
                key={store.id}
                href={`/stores/${store.id}`}
                name={store.name}
                subdomain={store.subdomain}
                rootDomain={env.ROOT_DOMAIN}
                pageCount={store._count.pages}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
