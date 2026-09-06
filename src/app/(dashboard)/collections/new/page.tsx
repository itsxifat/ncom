import { getActiveOrganization } from '@/server/services/organizationService'
import { listPickerProducts } from '@/server/services/productService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { CollectionForm } from '@/components/store/collection-form'

export default async function NewCollectionPage() {
  const { organization } = await getActiveOrganization()
  const catalog = await listPickerProducts(organization.id)

  return (
    <PageShell>
      <PageHeader
        backHref={`/collections`}
        backLabel="Collections"
        title="New collection"
      />
      <CollectionForm
        products={catalog.products}
        productsCursor={catalog.nextCursor}
        productsTotal={catalog.total}
        currencyCode={catalog.currencyCode}
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
