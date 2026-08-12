import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { PageHeader } from '@/components/app/page-header'
import { ProductForm } from '@/components/store/product-form'

export default async function NewProductPage() {
  const { organization } = await getActiveOrganization()
  const settings = await getOrganizationSettings(organization.id)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/products`}
        backLabel="Products"
        title="New product"
      />
      <ProductForm
        currencyCode={settings?.currencyCode ?? 'USD'}
        initial={{
          title: '',
          handle: '',
          description: '',
          status: 'DRAFT',
          productType: '',
          vendor: '',
          tags: [],
          seoTitle: '',
          seoDescription: '',
          options: [],
          images: [],
          variants: [],
        }}
      />
    </div>
  )
}
