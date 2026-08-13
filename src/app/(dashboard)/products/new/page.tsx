import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { listCategoryOptions } from '@/server/services/categoryService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { ProductForm } from '@/components/store/product-form'

export default async function NewProductPage() {
  const { organization } = await getActiveOrganization()
  const [settings, categories] = await Promise.all([
    getOrganizationSettings(organization.id),
    listCategoryOptions(organization.id),
  ])

  return (
    <PageShell>
      <PageHeader
        backHref={`/products`}
        backLabel="Products"
        title="New product"
      />
      <ProductForm
        currencyCode={settings?.currencyCode ?? 'USD'}
        categories={categories}
        initial={{
          title: '',
          handle: '',
          description: '',
          status: 'DRAFT',
          productType: '',
          vendor: '',
          tags: [],
          categoryId: null,
          seoTitle: '',
          seoDescription: '',
          options: [],
          images: [],
          variants: [],
        }}
      />
    </PageShell>
  )
}
