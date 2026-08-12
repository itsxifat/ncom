import { listTemplateCategories } from '@/server/services/templateService'
import { PageHeader } from '@/components/app/page-header'
import { CategoryList } from './CategoryList'

export default async function AdminTemplateCategoriesPage() {
  const categories = await listTemplateCategories()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref="/admin/templates"
        backLabel="Templates"
        eyebrow="Content"
        title="Template categories"
        description="How the template gallery is grouped for tenants."
      />
      <CategoryList categories={categories} />
    </div>
  )
}
