import Link from 'next/link'
import { Package, PlugZap, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  listProducts,
  PRODUCT_SORTS,
  type ProductSort,
} from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { listCategoryOptions } from '@/server/services/categoryService'
import { describeFailure, getConnectionStatus } from '@/server/catalog'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import {
  ProductBulkList,
  type ProductListRow,
} from '@/components/store/product-bulk-list'

const PAGE_SIZE = 50

/**
 * The catalogue: both of them, in one list.
 *
 * Products stored in NCOM come first and are fully editable from here —
 * selected in batches, published, archived, filed, duplicated, deleted. Products
 * read from the merchant's connected website follow, and link out to their own
 * admin: they are theirs, and the closest this screen gets to editing one is
 * opening the page where it can be edited.
 *
 * Every row says which it is, because a merchant looking at two similarly named
 * shirts needs to know which one is on their shop and which one they typed in
 * here, and because only one of the two can be acted on.
 *
 * Paging is by cursor rather than page number: half of this list is a website
 * that can only be asked for "the next page", and pretending to a page 7 would
 * produce different products depending on what sold in the meantime.
 */
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
  const sort =
    typeof query.sort === 'string' && query.sort in PRODUCT_SORTS
      ? (query.sort as ProductSort)
      : 'title'
  const categoryId = typeof query.category === 'string' ? query.category : null
  const cursor = typeof query.cursor === 'string' ? query.cursor : null

  const { organization } = await getActiveOrganization()

  const [settings, connection, categories] = await Promise.all([
    getOrganizationSettings(organization.id),
    getConnectionStatus(organization.id),
    listCategoryOptions(organization.id),
  ])

  let items: Awaited<ReturnType<typeof listProducts>>['items'] = []
  let nextCursor: string | null = null
  let total: number | null = null
  let failure: string | null = null

  try {
    const page = await listProducts(organization.id, {
      search,
      status,
      sort,
      categoryId,
      take: PAGE_SIZE,
      cursor,
    })
    items = page.items
    nextCursor = page.nextCursor
    total = page.total
  } catch (error) {
    failure = describeFailure(error)
  }

  const currency = settings?.currencyCode ?? 'BDT'
  const filtered = Boolean(search || status || categoryId)

  // Nothing here at all, and no website connected: the merchant has not started.
  // Both routes out are offered, because either is a legitimate way to run this.
  if (!connection && items.length === 0 && !filtered && !failure) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        description="Sell what is already on your website by connecting it — nothing is copied, we read it live — or add products here for the things it does not carry. Most workspaces end up doing both."
        action={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/products/new" />} nativeButton={false}>
              <Plus />
              Add product
            </Button>
            <Button
              variant="outline"
              render={<Link href="/settings/product-source" />}
              nativeButton={false}
            >
              <PlugZap />
              Connect your website
            </Button>
          </div>
        }
      />
    )
  }

  if (failure) {
    return (
      <EmptyState
        icon={Package}
        title="Your catalogue could not be read"
        description={failure}
        action={
          <Button
            variant="outline"
            render={<Link href="/settings/product-source" />}
            nativeButton={false}
          >
            Check the connection
          </Button>
        }
      />
    )
  }

  const categoryNames = new Map(
    // The labels carry an indent prefix for the tree control; a row's meta line
    // wants the bare name.
    categories.map((option) => [option.id, option.label.replace(/^(— )+/, '')])
  )

  const rows: ProductListRow[] = items.map((product) => {
    const prices = product.variants.map((variant) => variant.priceCents)

    // Summed across variants, and null only when *nothing* on the product is
    // counted. A product with one tracked variant at 0 and one untracked is out
    // of stock in the part that can run out, and saying "not counted" there
    // would hide the number that matters.
    const counted = product.variants.filter(
      (variant) => variant.available !== null
    )

    return {
      source: product.source,
      id: product.id,
      title: product.title,
      status: product.status,
      imageUrl: product.images[0]?.url ?? null,
      categoryName: product.categoryId
        ? (categoryNames.get(product.categoryId) ?? null)
        : null,
      variantCount: product.variants.length,
      stock:
        counted.length === 0
          ? null
          : counted.reduce((sum, variant) => sum + (variant.available ?? 0), 0),
      minPriceCents: prices.length > 0 ? Math.min(...prices) : 0,
      maxPriceCents: prices.length > 0 ? Math.max(...prices) : 0,
      url: product.url,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {connection ? (
            <>
              Your own products, plus everything read live from{' '}
              <span className="font-medium">{hostOf(connection.baseUrl)}</span>.
            </>
          ) : (
            <>
              Your own products.{' '}
              <Link href="/settings/product-source" className="underline">
                Connect a website
              </Link>{' '}
              to sell what it already carries.
            </>
          )}
        </p>
        <Button
          size="sm"
          render={<Link href="/products/new" />}
          nativeButton={false}
        >
          <Plus />
          Add product
        </Button>
      </div>

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
        {categories.length > 0 && (
          <FormSelect name="category" defaultValue={categoryId ?? ''}>
            <option value="">All categories</option>
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FormSelect>
        )}
        <FormSelect name="sort" defaultValue={sort}>
          <option value="title">A – Z</option>
          <option value="title-desc">Z – A</option>
        </FormSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {filtered && (
          <Button
            variant="ghost"
            render={<Link href="/products" />}
            nativeButton={false}
          >
            Clear
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nothing to show"
          description={
            filtered
              ? 'No product matches these filters — in NCOM or on your website.'
              : 'Add your first product, or check that your connected website lists them and that they are published.'
          }
          action={
            <Button render={<Link href="/products/new" />} nativeButton={false}>
              <Plus />
              Add product
            </Button>
          }
        />
      ) : (
        <ProductBulkList
          rows={rows}
          total={total}
          currencyCode={currency}
          basePath="/products"
          categories={categories.filter((option) => option.source === 'LOCAL')}
        />
      )}

      {nextCursor && (
        <nav className="flex justify-end">
          <Button
            variant="outline"
            render={<Link href={nextHref(query, nextCursor)} />}
            nativeButton={false}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  )
}

function nextHref(
  query: Record<string, string | string[] | undefined>,
  cursor: string
): string {
  const params = new URLSearchParams()
  for (const key of ['q', 'status', 'category', 'sort']) {
    const value = query[key]
    if (typeof value === 'string' && value) params.set(key, value)
  }
  params.set('cursor', cursor)
  return `/products?${params.toString()}`
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}
