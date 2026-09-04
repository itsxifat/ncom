import { getActiveOrganization } from '@/server/services/organizationService'
import { listCategoryOptions } from '@/server/services/categoryService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { CategoryForm } from '@/components/store/category-form'

export default async function NewCategoryPage({
  searchParams,
}: PageProps<'/categories/new'>) {
  const query = await searchParams
  // Set by the "Add subcategory" button on the tree, so creating a child starts
  // in the right place instead of at the top level with a select to fix.
  const parentId = typeof query.parent === 'string' ? query.parent : null

  const { organization } = await getActiveOrganization()
  // Local only: a category created here is a row in this database, and its
  // parent has to be one too. The merchant's own tree is theirs to nest.
  const options = await listCategoryOptions(organization.id, {
    localOnly: true,
  })

  return (
    <PageShell>
      <PageHeader
        backHref="/categories"
        backLabel="Categories"
        title="New category"
      />
      <CategoryForm
        parentOptions={options}
        initial={{
          name: '',
          handle: '',
          parentId,
          description: '',
          code: '',
          isActive: true,
          isFeatured: false,
          seoTitle: '',
          seoDescription: '',
        }}
      />
    </PageShell>
  )
}
