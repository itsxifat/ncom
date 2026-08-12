import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageThemeProvider } from '@/modules/sections/theme'
import { AddToCartForm } from '@/components/storefront/add-to-cart-form'
import {
  loadProductDrop,
  renderStorefrontTemplate,
  resolveStore,
} from '@/server/services/storefrontRenderService'
import { formatMoney } from '@/lib/money'
import { DEFAULT_THEME } from '@/lib/default-theme'

/**
 * Product detail.
 *
 * Renders the store's published PRODUCT Liquid template when it has one, and
 * falls back to a built-in layout when it does not. The fallback is not a
 * placeholder: a merchant who never touches theme code still gets a working,
 * themed, purchasable product page, and Liquid stays an opt-in escape hatch
 * rather than a prerequisite for selling anything.
 */

interface RouteParams {
  subdomain: string
  handle: string
}

interface SearchParams {
  variant?: string
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}): Promise<Metadata> {
  const { subdomain, handle } = await params
  const store = await resolveStore(subdomain)
  if (!store) return {}

  const product = await loadProductDrop(store.id, handle)
  if (!product) return {}

  return {
    title: product.seo_title || product.title,
    description: product.seo_description ?? product.description ?? undefined,
    robots: store.isSearchIndexable
      ? undefined
      : { index: false, follow: false },
    icons: store.theme?.faviconUrl
      ? { icon: store.theme.faviconUrl }
      : undefined,
    openGraph: {
      title: product.seo_title || product.title,
      description: product.seo_description ?? product.description ?? undefined,
      images: product.featured_image ? [product.featured_image.src] : undefined,
      type: 'website',
    },
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { subdomain, handle } = await params
  const { variant: selectedVariantId } = await searchParams

  const store = await resolveStore(subdomain)
  if (!store) notFound()

  const product = await loadProductDrop(store.id, handle, { selectedVariantId })
  if (!product) notFound()

  const currency = store.organization.settings?.currencyCode ?? 'USD'
  const theme = store.theme ?? DEFAULT_THEME

  const rendered = await renderStorefrontTemplate(store.id, 'PRODUCT', {
    product,
    request_path: `/products/${handle}`,
  })

  if (!rendered.missingTemplate) {
    return (
      <PageThemeProvider theme={theme}>
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      </PageThemeProvider>
    )
  }

  const price =
    product.selected_or_first_available_variant?.price ?? product.price
  const compareAt =
    product.selected_or_first_available_variant?.compare_at_price ??
    product.compare_at_price

  return (
    <PageThemeProvider theme={theme}>
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          {product.featured_image ? (
            // Storefront images come from tenant uploads on an external CDN,
            // so they are not a build-time next/image optimisation target.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.featured_image.src}
              alt={product.featured_image.alt ?? product.title}
              className="w-full rounded-[var(--page-radius)]"
            />
          ) : (
            <div className="aspect-square w-full rounded-[var(--page-radius)] bg-black/5" />
          )}

          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.images.slice(1, 5).map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.src}
                  alt={image.alt ?? ''}
                  className="w-full rounded-[var(--page-radius)]"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            {product.vendor && (
              <p className="text-sm tracking-wide uppercase opacity-60">
                {product.vendor}
              </p>
            )}
            <h1 className="mt-1 text-3xl font-semibold">{product.title}</h1>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-medium">
              {formatMoney(price, currency)}
            </span>
            {compareAt !== null && compareAt > price && (
              <span className="text-lg line-through opacity-50">
                {formatMoney(compareAt, currency)}
              </span>
            )}
          </div>

          {!product.available && (
            <p className="text-sm font-medium" style={{ color: '#dc2626' }}>
              Currently unavailable
            </p>
          )}

          <AddToCartForm
            subdomain={subdomain}
            variants={product.variants.map((variant) => ({
              id: variant.id,
              title: variant.title,
              priceCents: variant.price,
              available: variant.available,
            }))}
            formatPrice={(cents) => formatMoney(cents, currency)}
          />

          {product.description && (
            <div
              className="prose max-w-none opacity-90"
              // Product descriptions are merchant-authored rich text for their
              // own storefront — the same trust model as Liquid sections.
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}
        </div>
      </div>
    </PageThemeProvider>
  )
}
