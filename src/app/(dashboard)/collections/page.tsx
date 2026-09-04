import Link from 'next/link'
import { Layers, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listCollections } from '@/server/services/collectionService'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowText,
} from '@/components/app/list-panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function CollectionsPage() {
  const { organization } = await getActiveOrganization()
  const collections = await listCollections(organization.id)

  const base = `/collections`

  if (collections.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No collections yet"
        description="Group products by hand, or with rules that keep themselves up to date as your catalogue changes."
        action={
          <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
            <Plus />
            New collection
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
          <Plus />
          New collection
        </Button>
      </div>

      <ListPanel>
        <ListPanelHeader>
          <p className="text-muted-foreground text-sm">
            {collections.length}{' '}
            {collections.length === 1 ? 'collection' : 'collections'}
          </p>
        </ListPanelHeader>

        {collections.map((collection) => (
          <ListRow key={collection.id}>
            <ListRowText
              title={
                <Link
                  href={`${base}/${collection.id}`}
                  className="hover:underline"
                >
                  {collection.title}
                </Link>
              }
              meta={
                collection.type === 'AUTOMATED'
                  ? `Matched by ${(collection.rules as unknown[] | null)?.length ?? 0} rules`
                  : `${collection._count.products} products`
              }
              badges={
                <Badge
                  variant={
                    collection.type === 'AUTOMATED' ? 'lime' : 'secondary'
                  }
                >
                  {collection.type === 'AUTOMATED' ? 'Automated' : 'Manual'}
                </Badge>
              }
            />
          </ListRow>
        ))}
      </ListPanel>
    </div>
  )
}
