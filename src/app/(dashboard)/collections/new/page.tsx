import { getActiveOrganization } from '@/server/services/organizationService'
import { listProducts } from '@/server/services/productService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { CollectionForm } from '@/components/store/collection-form'

export default async function NewCollectionPage() {
  const { organization } = await getActiveOrganization()
  const { items } = await listProducts(organization.id, { take: 200 })

  return (
    <PageShell>
      <PageHeader
        backHref={`/collections`}
        backLabel="Collections"
        title="New collection"
      />
      <CollectionForm
        products={items.map((product) => ({
          id: product.id,
          title: product.title,
        }))}
        initial={{
          title: '',
          handle: '',
          description: '',
          type: 'MANUAL',
          rulesMatch: 'ALL',
          sortOrder: 'MANUAL',
          rules: [],
          productIds: [],
          seoTitle: '',
          seoDescription: '',
        }}
      />
    </PageShell>
  )
}
