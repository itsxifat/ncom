import { getActiveOrganization } from '@/server/services/organizationService'
import { listProducts } from '@/server/services/productService'
import { PageHeader } from '@/components/app/page-header'
import { CollectionForm } from '@/components/store/collection-form'

export default async function NewCollectionPage() {
  const { organization } = await getActiveOrganization()
  const { items } = await listProducts(organization.id, { take: 200 })

  return (
    <div className="flex flex-col gap-8">
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
    </div>
  )
}
