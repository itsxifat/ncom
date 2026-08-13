import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  descendantIds,
  getCategory,
  getCategoryPath,
  listCategoryOptions,
} from '@/server/services/categoryService'
import { listProducts } from '@/server/services/productService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { CategoryForm } from '@/components/store/category-form'
import { SettingsSection } from '@/components/app/settings-section'
import { Badge } from '@/components/ui/badge'

export default async function CategoryPage({
  params,
}: PageProps<'/categories/[categoryId]'>) {
  const { categoryId } = await params
  const { organization } = await getActiveOrganization()

  let category
  try {
    category = await getCategory(organization.id, categoryId)
  } catch {
    notFound()
  }

  const [options, path, subtree] = await Promise.all([
    listCategoryOptions(organization.id),
    getCategoryPath(organization.id, categoryId),
    descendantIds(organization.id, categoryId),
  ])

  // Products anywhere beneath this node, which is what "what is in here" means
  // to anyone looking at a department.
  const { items, total } = await listProducts(organization.id, {
    categoryIds: subtree,
    take: 20,
  })

  return (
    <PageShell>
      <PageHeader
        backHref="/categories"
        backLabel="Categories"
        title={category.name}
        description={path.map((step) => step.name).join(' → ')}
      />

      <CategoryForm
        parentOptions={options.filter(
          // A category cannot be moved inside its own subtree, so those are not
          // offered — the service refuses it, and a select that can produce an
          // error is a worse select.
          (option) => !subtree.includes(option.id)
        )}
        initial={{
          id: category.id,
          name: category.name,
          handle: category.handle,
          parentId: category.parentId,
          description: category.description ?? '',
          code: category.code ?? '',
          isActive: category.isActive,
          isFeatured: category.isFeatured,
          seoTitle: category.seoTitle ?? '',
          seoDescription: category.seoDescription ?? '',
        }}
      />

      <SettingsSection
        title="Products"
        description={`${total} filed in this category or below it.`}
      >
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing filed here yet. Pick this category on a product, or select
            several products on the catalogue page and file them at once.
          </p>
        ) : (
          <div className="bg-card divide-y overflow-hidden rounded-xl border">
            {items.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <div className="bg-muted size-9 shrink-0 overflow-hidden rounded-md">
                  {product.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
                    <img
                      src={product.images[0].media.url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <Link
                  href={`/products/${product.id}`}
                  className="flex-1 truncate font-medium hover:underline"
                >
                  {product.title}
                </Link>
                <Badge
                  variant={product.status === 'ACTIVE' ? 'lime' : 'secondary'}
                >
                  {product.status.toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </PageShell>
  )
}
