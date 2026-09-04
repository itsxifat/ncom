import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getCategory, getCategoryPath } from '@/server/services/categoryService'
import { listProducts } from '@/server/services/productService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { Badge } from '@/components/ui/badge'

/**
 * One category and what is filed under it, as the merchant's website says.
 *
 * The products list is the category's own — not the whole subtree, which the
 * local version could compute because it held every row. Asking a connector for
 * "everything under this node" would mean one request per descendant, and a
 * department with forty children would be forty requests to a merchant's shared
 * host to render one admin screen.
 */
export default async function CategoryPage({
  params,
}: PageProps<'/categories/[categoryId]'>) {
  const { categoryId } = await params
  const { organization } = await getActiveOrganization()

  const category = await getCategory(organization.id, categoryId).catch(
    () => null
  )
  if (!category) notFound()

  const [path, listed] = await Promise.all([
    getCategoryPath(organization.id, categoryId),
    listProducts(organization.id, { categoryId, take: 20 }).catch(() => ({
      items: [],
      nextCursor: null,
      total: null,
    })),
  ])

  return (
    <PageShell>
      <PageHeader
        backHref="/categories"
        backLabel="Categories"
        title={category.name}
        description={path.map((step) => step.name).join(' → ')}
      />

      <SettingsSection
        title="Products"
        description="Filed under this category on your website."
      >
        {listed.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing is filed here, or your connector does not filter by
            category.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {listed.items.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Link
                  href={`/products/${encodeURIComponent(product.id)}`}
                  className="truncate hover:underline"
                >
                  {product.title}
                </Link>
                {product.status !== 'ACTIVE' && (
                  <Badge variant="outline">
                    {product.status === 'DRAFT' ? 'Draft' : 'Archived'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </PageShell>
  )
}
