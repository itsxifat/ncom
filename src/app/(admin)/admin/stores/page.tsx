import { FolderKanban } from 'lucide-react'
import { listAllStores } from '@/server/services/adminService'
import { env } from '@/lib/env'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { ListPanel } from '@/components/app/list-panel'
import { StoreRow } from './StoreRow'

export default async function AdminStoresPage() {
  const stores = await listAllStores()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Content"
        title="Stores"
        description={`${stores.length} ${stores.length === 1 ? 'store' : 'stores'} across every tenant.`}
      />

      {stores.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No stores yet"
          description="Stores appear here as soon as a tenant creates one."
        />
      ) : (
        <ListPanel>
          {stores.map((store) => (
            <StoreRow
              key={store.id}
              storeId={store.id}
              name={store.name}
              subdomain={store.subdomain}
              rootDomain={env.ROOT_DOMAIN}
              organizationName={store.organization.name}
              pageCount={store._count.pages}
            />
          ))}
        </ListPanel>
      )}
    </div>
  )
}
