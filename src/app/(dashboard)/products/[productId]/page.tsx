import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getProduct } from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { listStores } from '@/server/services/storeService'
import { env } from '@/lib/env'
import { centsToMajorString } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { Button } from '@/components/ui/button'
import { ProductForm } from '@/components/store/product-form'
import { ProductDangerZone } from '@/components/store/product-danger-zone'

export default async function EditProductPage({
  params,
}: PageProps<'/products/[productId]'>) {
  const { productId } = await params
  const { organization } = await getActiveOrganization()

  let product
  try {
    product = await getProduct(organization.id, productId)
  } catch {
    notFound()
  }

  const [settings, stores] = await Promise.all([
    getOrganizationSettings(organization.id),
    listStores(organization.id),
  ])

  const currency = settings?.currencyCode ?? 'USD'

  // The catalogue is organisation-wide but a product page lives on a *store*,
  // so "view on storefront" needs one to point at. Previously this interpolated
  // an empty string where the subdomain belongs and produced
  // `http://.ncom.local/products/…`, which resolves nowhere. With several
  // stores the first is as good a guess as any; with none there is nothing to
  // link to and the button is hidden.
  const storefront = stores[0] ?? null

  // Prices round-trip through the form as major-unit strings, which is what
  // the merchant typed and what the action converts back to minor units.
  const toMajor = (cents: number | null) => centsToMajorString(cents, currency)

  return (
    <PageShell>
      <PageHeader
        backHref={`/products`}
        backLabel="Products"
        title={product.title}
        actions={
          product.status === 'ACTIVE' && storefront ? (
            <Button
              variant="outline"
              render={
                <a
                  href={`http://${storefront.subdomain}.${env.ROOT_DOMAIN}/products/${product.handle}`}
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
        initial={{
          id: product.id,
          title: product.title,
          handle: product.handle,
          description: product.description ?? '',
          status: product.status,
          productType: product.productType ?? '',
          vendor: product.vendor ?? '',
          tags: product.tags,
          seoTitle: product.seoTitle ?? '',
          seoDescription: product.seoDescription ?? '',
          options: product.options.map((option) => ({
            name: option.name,
            values: option.values,
          })),
          images: product.images.map((image) => ({
            mediaId: image.mediaId,
            url: image.media.url,
            altText: image.altText ?? '',
            position: image.position,
          })),
          variants: product.variants.map((variant, index) => ({
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
              product.images.find((image) => image.id === variant.imageId)
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

      <ProductDangerZone productId={product.id} />
    </PageShell>
  )
}
