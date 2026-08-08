import { listTemplateCategories } from '@/server/services/templateService'
import { CategoryList } from './CategoryList'

export default async function AdminTemplateCategoriesPage() {
  const categories = await listTemplateCategories()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Template categories
        </h1>
        <p className="text-muted-foreground mt-1">
          Organize the template gallery tenants browse.
        </p>
      </div>
      <CategoryList categories={categories} />
    </div>
  )
}
