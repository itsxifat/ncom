import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getProduct } from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { formatMoneyAmount } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * One product, as the merchant's website currently describes it.
 *
 * There is no form here any more. This screen exists so someone working on an
 * offer can check what they are about to sell — the photos, the sizes, the
 * prices, what is in stock — without leaving the dashboard, and then go and
 * edit it in the one place it can be edited.
 *
 * Every number on the page was read in this request. Reload it after changing
 * something on the shop and the change is here; there is nothing to sync and
 * nothing that can be stale.
 */
export default async function ProductPage({
  params,
}: PageProps<'/products/[productId]'>) {
  const { productId } = await params
  const { organization } = await getActiveOrganization()

  const [settings, product] = await Promise.all([
    getOrganizationSettings(organization.id),
    getProduct(organization.id, productId).catch(() => null),
  ])

  if (!product) notFound()

  const currency = settings?.currencyCode ?? 'BDT'

  return (
    <PageShell>
      <PageHeader
        backHref="/products"
        backLabel="Products"
        title={product.title}
        actions={
          product.url ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a href={product.url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Edit on your website
                </a>
              }
            />
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={product.status === 'ACTIVE' ? 'default' : 'outline'}>
            {product.status === 'ACTIVE'
              ? 'Active'
              : product.status === 'DRAFT'
                ? 'Draft'
                : 'Archived'}
          </Badge>
          <span className="text-muted-foreground text-sm">
            {product.handle}
          </span>
          {product.vendor && (
            <span className="text-muted-foreground text-sm">
              · {product.vendor}
            </span>
          )}
        </div>

        {product.images.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {product.images.slice(0, 8).map((image) => (
              // Not next/image: these are on the merchant's own domain, which
              // differs per tenant and cannot be an allowlisted remote pattern.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={image.url}
                src={image.url}
                alt={image.alt ?? ''}
                className="bg-muted size-28 rounded-lg object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        <section className="bg-card overflow-hidden rounded-xl border">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-medium">Options and stock</h2>
            <p className="text-muted-foreground text-xs">
              Read live · edit on your website
            </p>
          </header>

          <div className="divide-y">
            {product.variants.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {variant.title === 'Default Title'
                      ? product.title
                      : variant.title}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {variant.sku ?? 'No SKU'}
                  </p>
                </div>

                <span className="font-mono tabular-nums">
                  {formatMoneyAmount(variant.priceCents, currency)}
                </span>

                <span className="w-28 text-right">
                  {variant.available === null ? (
                    <span className="text-muted-foreground">Not counted</span>
                  ) : variant.available > 0 ? (
                    <span className="font-mono tabular-nums">
                      {variant.available} in stock
                    </span>
                  ) : (
                    <span className="text-destructive">
                      {variant.policy === 'CONTINUE'
                        ? 'Backorder'
                        : 'Out of stock'}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <p className="text-muted-foreground text-sm">
          This product is stored on your own website. NCOM keeps no copy of it —{' '}
          <Link href="/settings/product-source" className="underline">
            product source settings
          </Link>
          .
        </p>
      </div>
    </PageShell>
  )
}
