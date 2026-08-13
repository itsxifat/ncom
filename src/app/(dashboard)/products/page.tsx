import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listProducts } from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import {
  descendantIds,
  listCategoryOptions,
} from '@/server/services/categoryService'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ProductBulkList,
  type ProductListRow,
} from '@/components/store/product-bulk-list'
import {
  PRODUCT_SORTS,
  type ProductSort,
} from '@/server/services/productService'
import { FormSelect } from '@/components/ui/form-select'

const PAGE_SIZE = 50

export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  const query = await searchParams

  const search = typeof query.q === 'string' ? query.q : undefined
  const status =
    query.status === 'DRAFT' ||
    query.status === 'ACTIVE' ||
    query.status === 'ARCHIVED'
      ? query.status
      : undefined
  const page = Math.max(1, Number(query.page) || 1)
  const sort: ProductSort =
    typeof query.sort === 'string' && query.sort in PRODUCT_SORTS
      ? (query.sort as ProductSort)
      : 'newest'

  const categoryParam = typeof query.category === 'string' ? query.category : ''

  const { organization } = await getActiveOrganization()

  // "Womenswear" on this filter means everything beneath it too, which is what
  // a merchant means by it — the products filed directly against a department
  // are usually the minority.
  const categoryIds =
    categoryParam && categoryParam !== 'none'
      ? await descendantIds(organization.id, categoryParam)
      : undefined

  const [settings, { items, total }, categoryOptions] = await Promise.all([
    getOrganizationSettings(organization.id),
    listProducts(organization.id, {
      search,
      status,
      sort,
      categoryIds,
      uncategorized: categoryParam === 'none',
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    listCategoryOptions(organization.id),
  ])

  const currency = settings?.currencyCode ?? 'USD'
  const base = `/products`

  // Paging used to drop the search and the filters, so page 2 of a filtered
  // catalogue was page 2 of the whole catalogue.
  const pageQuery = (next: number) => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    if (categoryParam) params.set('category', categoryParam)
    if (sort !== 'newest') params.set('sort', sort)
    params.set('page', String(next))
    return params.toString()
  }

  if (total === 0 && !search && !status && !categoryParam) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        description="A product needs a title and at least one price. You can add variants, images and inventory afterwards."
        action={
          <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
            <Plus />
            Add product
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-center gap-3">
        <Input
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search title, handle or SKU"
          className="w-full sm:w-72"
        />
        <FormSelect name="status" defaultValue={status ?? ''}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </FormSelect>
        {categoryOptions.length > 0 && (
          <FormSelect name="category" defaultValue={categoryParam}>
            <option value="">All categories</option>
            {/* Finding the unfiled products is how a taxonomy actually gets
                finished, so it is a filter rather than something to notice. */}
            <option value="none">Not in a category</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FormSelect>
        )}
        <FormSelect name="sort" defaultValue={sort}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="title">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
        </FormSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        <Button
          className="ml-auto"
          render={<Link href={`${base}/new`} />}
          nativeButton={false}
        >
          <Plus />
          Add product
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products match"
          description="Try a different search term or status filter."
        />
      ) : (
        <ProductBulkList
          rows={items.map(toListRow)}
          total={total}
          currencyCode={currency}
          basePath={base}
          categories={categoryOptions}
        />
      )}

      {total > PAGE_SIZE && (
        <nav className="flex justify-between">
          {page > 1 ? (
            <Button
              variant="outline"
              render={<Link href={`${base}?${pageQuery(page - 1)}`} />}
              nativeButton={false}
            >
              Previous
            </Button>
          ) : (
            <span />
          )}
          {page * PAGE_SIZE < total && (
            <Button
              variant="outline"
              render={<Link href={`${base}?${pageQuery(page + 1)}`} />}
              nativeButton={false}
            >
              Next
            </Button>
          )}
        </nav>
      )}
    </div>
  )
}

/**
 * Flattens a product into what the list actually displays.
 *
 * Stock is summed across every tracked variant and every location, because the
 * list answers "can I sell this at all", not "where is it". A product with
 * nothing tracked reports null rather than 0 — it is infinitely available, and
 * showing "0 in stock" next to real counts reads as sold out.
 */
function toListRow(product: {
  id: string
  title: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  images: { media: { url: string } }[]
  category: { name: string } | null
  variants: {
    priceCents: number
    inventoryTracked: boolean
    inventoryLevels: { available: number }[]
  }[]
}): ProductListRow {
  const prices = product.variants.map((variant) => variant.priceCents)
  const tracked = product.variants.some((variant) => variant.inventoryTracked)

  return {
    id: product.id,
    title: product.title,
    status: product.status,
    imageUrl: product.images[0]?.media.url ?? null,
    categoryName: product.category?.name ?? null,
    variantCount: product.variants.length,
    stock: tracked
      ? product.variants.reduce((sum, variant) => {
          if (!variant.inventoryTracked) return sum
          return (
            sum +
            variant.inventoryLevels.reduce(
              (levelSum, level) => levelSum + level.available,
              0
            )
          )
        }, 0)
      : null,
    minPriceCents: prices.length > 0 ? Math.min(...prices) : 0,
    maxPriceCents: prices.length > 0 ? Math.max(...prices) : 0,
  }
}
