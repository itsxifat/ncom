import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  descendantIds,
  getCategory,
  getCategoryPath,
  getEditableCategory,
  listCategoryOptions,
} from '@/server/services/categoryService'
import { listProducts } from '@/server/services/productService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { CategoryForm } from '@/components/store/category-form'
import { SettingsSection } from '@/components/app/settings-section'
import { Badge } from '@/components/ui/badge'

/**
 * One category — and which of two screens that means.
 *
 * NCOM's own categories get the editor. A category on the merchant's website is
 * shown with what is filed under it and nothing to change, because renaming it
 * here would rename nothing: their tree lives in their admin.
 */
export default async function CategoryPage({
  params,
}: PageProps<'/categories/[categoryId]'>) {
  const { categoryId } = await params
  const { organization } = await getActiveOrganization()

  const editable = await getEditableCategory(organization.id, categoryId)

  const [node, path, listed] = await Promise.all([
    getCategory(organization.id, categoryId),
    getCategoryPath(organization.id, categoryId),
    // What is filed directly under this node. Not the whole subtree: asking a
    // connector for "everything under here" is one request per descendant, and
    // a department with forty children would be forty requests to a merchant's
    // shared host to render one admin screen.
    listProducts(organization.id, { categoryId, take: 20 }).catch(() => ({
      items: [],
      nextCursor: null,
      total: null,
    })),
  ])

  if (!editable && !node) notFound()

  const subtree = editable
    ? await descendantIds(organization.id, categoryId)
    : [categoryId]

  const options = editable
    ? await listCategoryOptions(organization.id, { localOnly: true })
    : []

  return (
    <PageShell>
      <PageHeader
        backHref="/categories"
        backLabel="Categories"
        title={editable?.name ?? node?.name ?? 'Category'}
        description={path.map((step) => step.name).join(' → ')}
      />

      {editable ? (
        <CategoryForm
          parentOptions={options.filter(
            // A category cannot be moved inside its own subtree, so those are
            // not offered — the service refuses it, and a select that can
            // produce an error is a worse select.
            (option) => !subtree.includes(option.id)
          )}
          initial={{
            id: editable.id,
            name: editable.name,
            handle: editable.handle,
            parentId: editable.parentId,
            description: editable.description ?? '',
            code: editable.code ?? '',
            isActive: editable.isActive,
            isFeatured: editable.isFeatured,
            seoTitle: editable.seoTitle ?? '',
            seoDescription: editable.seoDescription ?? '',
          }}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          This category is on your own website and is edited there. It is shown
          here so you can see what your storefront filters by.
        </p>
      )}

      <SettingsSection
        title="Products"
        description={
          editable
            ? 'Filed directly in this category.'
            : 'Filed under this category on your website.'
        }
      >
        {listed.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing is filed here yet.
          </p>
        ) : (
          <div className="bg-card divide-y overflow-hidden rounded-xl border">
            {listed.items.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <div className="bg-muted size-9 shrink-0 overflow-hidden rounded-md">
                  {product.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- tenant CDN and merchant domains are not in next/image's allowlist
                    <img
                      src={product.images[0].url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <Link
                  href={`/products/${encodeURIComponent(product.id)}`}
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
