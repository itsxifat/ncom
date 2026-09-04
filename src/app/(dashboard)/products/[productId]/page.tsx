import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getEditableProduct,
  getProduct,
} from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { listCategoryOptions } from '@/server/services/categoryService'
import { listStores } from '@/server/services/storeService'
import { env } from '@/lib/env'
import { centsToMajorString, formatMoneyAmount } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProductForm } from '@/components/store/product-form'
import { ProductDangerZone } from '@/components/store/product-danger-zone'
import type { CatalogProduct } from '@/server/catalog'

/**
 * One product — and which of two screens that means.
 *
 * A product NCOM stores gets the editor: every field, every variant, its own
 * stock. A product read from the merchant's website gets a read-only view and a
 * link out to their admin, because it is theirs and editing it here would mean
 * either writing to their site or keeping a second copy, and this platform does
 * neither.
 *
 * The branch is a lookup, not a flag: `getEditableProduct` returns a row only
 * for a product in this workspace's own tables, so "can this be edited here" and
 * "is this ours" are the same question asked once.
 */
export default async function ProductPage({
  params,
}: PageProps<'/products/[productId]'>) {
  const { productId } = await params
  const { organization } = await getActiveOrganization()

  const [settings, editable] = await Promise.all([
    getOrganizationSettings(organization.id),
    getEditableProduct(organization.id, productId),
  ])

  const currency = settings?.currencyCode ?? 'BDT'

  if (!editable) {
    const remote = await getProduct(organization.id, productId).catch(
      () => null
    )
    if (!remote) notFound()

    return <RemoteProductView product={remote} currency={currency} />
  }

  const [stores, categories] = await Promise.all([
    listStores(organization.id),
    listCategoryOptions(organization.id, { localOnly: true }),
  ])

  // The catalogue is organisation-wide but a product page lives on a *store*,
  // so "view on storefront" needs one to point at. With several stores the
  // first is as good a guess as any; with none there is nothing to link to and
  // the button is hidden.
  const storefront = stores[0] ?? null

  // Prices round-trip through the form as major-unit strings, which is what the
  // merchant typed and what the action converts back to minor units.
  const toMajor = (cents: number | null) => centsToMajorString(cents, currency)

  return (
    <PageShell>
      <PageHeader
        backHref={`/products`}
        backLabel="Products"
        title={editable.title}
        actions={
          editable.status === 'ACTIVE' && storefront ? (
            <Button
              variant="outline"
              render={
                <a
                  href={`http://${storefront.subdomain}.${env.ROOT_DOMAIN}/products/${editable.handle}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
            >
              <ExternalLink />
              View on storefront
            </Button>
          ) : undefined
        }
      />

      <ProductForm
        currencyCode={currency}
        categories={categories}
        initial={{
          id: editable.id,
          title: editable.title,
          handle: editable.handle,
          description: editable.description ?? '',
          status: editable.status,
          productType: editable.productType ?? '',
          vendor: editable.vendor ?? '',
          tags: editable.tags,
          categoryId: editable.categoryId,
          seoTitle: editable.seoTitle ?? '',
          seoDescription: editable.seoDescription ?? '',
          options: editable.options.map((option) => ({
            name: option.name,
            values: option.values,
          })),
          images: editable.images.map((image) => ({
            mediaId: image.mediaId,
            url: image.media.url,
            altText: image.altText ?? '',
            position: image.position,
          })),
          variants: editable.variants.map((variant, index) => ({
            id: variant.id,
            option1: variant.option1,
            option2: variant.option2,
            option3: variant.option3,
            price: toMajor(variant.priceCents),
            compareAtPrice: toMajor(variant.compareAtPriceCents),
            cost: toMajor(variant.costCents),
            sku: variant.sku ?? '',
            barcode: variant.barcode ?? '',
            isTaxable: variant.isTaxable,
            inventoryTracked: variant.inventoryTracked,
            inventoryPolicy: variant.inventoryPolicy,
            requiresShipping: variant.requiresShipping,
            weightGrams: variant.weightGrams,
            position: variant.position ?? index + 1,
            // The form addresses images by mediaId, which is the identity that
            // survives a save; map the stored ProductImage id back to it.
            imageId:
              editable.images.find((image) => image.id === variant.imageId)
                ?.mediaId ?? null,
            // Summed across locations, matching how availability is computed
            // everywhere else on the platform.
            stock: variant.inventoryLevels.reduce(
              (total, level) => total + level.available,
              0
            ),
          })),
        }}
      />

      <ProductDangerZone productId={editable.id} />
    </PageShell>
  )
}

/**
 * A product on the merchant's own website, as their site currently describes it.
 *
 * No form. This exists so someone building an offer can check what they are
 * about to sell — the photos, the sizes, the prices, what is in stock — without
 * leaving the dashboard, and then go and edit it in the one place it can be
 * edited. Every number was read in this request.
 */
async function RemoteProductView({
  product,
  currency,
}: {
  product: CatalogProduct
  currency: string
}) {
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
