import Link from 'next/link'
import { FolderKanban, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listStores } from '@/server/services/storeService'
import { env } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { StoreTile } from '@/components/dashboard/store-tile'
import { StoreActionsMenu } from '@/components/dashboard/store-actions-menu'

export default async function StoresPage() {
  const { organization } = await getActiveOrganization()
  const stores = await listStores(organization.id)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={organization.name}
        title="Stores"
        description={`${stores.length} ${stores.length === 1 ? 'store' : 'stores'} in this workspace.`}
        actions={
          <Button render={<Link href="/stores/new" />} nativeButton={false}>
            <Plus />
            New store
          </Button>
        }
      />

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
          {stores.map((store) => (
            <StoreTile
              key={store.id}
              href={`/stores/${store.id}`}
              name={store.name}
              subdomain={store.subdomain}
              rootDomain={env.ROOT_DOMAIN}
              pageCount={store._count.pages}
              actions={<StoreActionsMenu storeId={store.id} />}
            />
          ))}
        </div>
      )}
    </div>
  )
}
