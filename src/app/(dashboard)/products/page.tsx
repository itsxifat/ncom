import Link from 'next/link'
import { ExternalLink, Package, PlugZap, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listProducts } from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { describeFailure, getConnectionStatus } from '@/server/catalog'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { formatMoneyAmount } from '@/lib/money'

const PAGE_SIZE = 50

/**
 * The catalogue: both of them, in one list.
 *
 * Products stored in NCOM come first and can be edited here. Products read from
 * the merchant's connected website follow, and link out to their own admin —
 * they are theirs, and the closest this screen gets to editing one is opening
 * the page where it can be edited.
 *
 * Every row says which it is, because a merchant looking at two similarly named
 * shirts needs to know which one is on their shop and which one they typed in
 * here, and because only one of the two has an edit link.
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
  const cursor = typeof query.cursor === 'string' ? query.cursor : null

  const { organization } = await getActiveOrganization()

  const [settings, connection] = await Promise.all([
    getOrganizationSettings(organization.id),
    getConnectionStatus(organization.id),
  ])

  let items: Awaited<ReturnType<typeof listProducts>>['items'] = []
  let nextCursor: string | null = null
  let failure: string | null = null

  try {
    const page = await listProducts(organization.id, {
      search,
      status,
      take: PAGE_SIZE,
      cursor,
    })
    items = page.items
    nextCursor = page.nextCursor
  } catch (error) {
    failure = describeFailure(error)
  }

  const currency = settings?.currencyCode ?? 'BDT'

  // Nothing here at all, and no website connected: the merchant has not started.
  // Both routes out are offered, because either is a legitimate way to run this.
  if (!connection && items.length === 0 && !search && !status && !failure) {
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
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nothing to show"
          description={
            search || status
              ? 'No product on your website matches these filters.'
              : 'Your website returned no products. Check that the connector lists them and that they are published.'
          }
        />
      ) : (
        <div className="bg-card divide-y overflow-hidden rounded-xl border">
          {items.map((product) => {
            const prices = product.variants.map((variant) => variant.priceCents)
            const min = prices.length > 0 ? Math.min(...prices) : 0
            const max = prices.length > 0 ? Math.max(...prices) : 0

            return (
              <div
                key={product.id}
                className="flex items-center gap-4 px-4 py-3 text-sm"
              >
                {product.images[0] ? (
                  // Not next/image: the host is the merchant's own domain,
                  // different for every tenant and unknowable at build time.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.images[0].url}
                    alt=""
                    className="bg-muted size-10 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="bg-muted size-10 shrink-0 rounded" />
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${encodeURIComponent(product.id)}`}
                    className="truncate font-medium hover:underline"
                  >
                    {product.title}
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {product.variants.length} option
                    {product.variants.length === 1 ? '' : 's'} ·{' '}
                    {min === max
                      ? formatMoneyAmount(min, currency)
                      : `${formatMoneyAmount(min, currency)} – ${formatMoneyAmount(max, currency)}`}
                  </p>
                </div>

                {product.status !== 'ACTIVE' && (
                  <Badge variant="outline" className="shrink-0">
                    {product.status === 'DRAFT' ? 'Draft' : 'Archived'}
                  </Badge>
                )}

                <Badge
                  variant="outline"
                  className="text-muted-foreground shrink-0"
                >
                  {product.source === 'LOCAL' ? 'In NCOM' : 'Your website'}
                </Badge>

                {product.url && (
                  <Link
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={`Open ${product.title} on your website`}
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {nextCursor && (
        <nav className="flex justify-end">
          <Button
            variant="outline"
            render={<Link href={nextHref(search, status, nextCursor)} />}
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
  search: string | undefined,
  status: string | undefined,
  cursor: string
): string {
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  if (status) params.set('status', status)
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
