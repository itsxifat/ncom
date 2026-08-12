import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageThemeProvider } from '@/modules/sections/theme'
import {
  loadCollectionDrop,
  renderStorefrontTemplate,
  resolveStore,
} from '@/server/services/storefrontRenderService'
import { formatMoney } from '@/lib/money'
import { DEFAULT_THEME } from '@/lib/default-theme'

interface RouteParams {
  subdomain: string
  handle: string
}

interface SearchParams {
  page?: string
}

const PAGE_SIZE = 24

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}): Promise<Metadata> {
  const { subdomain, handle } = await params
  const store = await resolveStore(subdomain)
  if (!store) return {}

  const collection = await loadCollectionDrop(store.id, handle)
  if (!collection) return {}

  return {
    title: collection.seo_title || collection.title,
    description:
      collection.seo_description ?? collection.description ?? undefined,
    robots: store.isSearchIndexable
      ? undefined
      : { index: false, follow: false },
    icons: store.theme?.faviconUrl
      ? { icon: store.theme.faviconUrl }
      : undefined,
  }
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { subdomain, handle } = await params
  const { page } = await searchParams

  const store = await resolveStore(subdomain)
  if (!store) notFound()

  // Clamped rather than trusted: a hostile `?page=99999999` would otherwise
  // become a very large OFFSET, which Postgres executes by counting through
  // every skipped row.
  const pageNumber = Math.max(1, Math.min(Number(page) || 1, 1000))

  const collection = await loadCollectionDrop(store.id, handle, {
    take: PAGE_SIZE,
    skip: (pageNumber - 1) * PAGE_SIZE,
  })
  if (!collection) notFound()

  const currency = store.organization.settings?.currencyCode ?? 'USD'
  const theme = store.theme ?? DEFAULT_THEME

  const rendered = await renderStorefrontTemplate(store.id, 'COLLECTION', {
    collection,
    request_path: `/collections/${handle}`,
  })

  if (!rendered.missingTemplate) {
    return (
      <PageThemeProvider theme={theme}>
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      </PageThemeProvider>
    )
  }

  return (
    <PageThemeProvider theme={theme}>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold">{collection.title}</h1>
          {collection.description && (
            <p className="mt-2 max-w-2xl opacity-70">
              {collection.description}
            </p>
          )}
        </header>

        {collection.products.length === 0 ? (
          <p className="opacity-70">No products in this collection yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-4">
            {collection.products.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.handle}`}
                className="group flex flex-col gap-3"
              >
                {product.featured_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.featured_image.src}
                    alt={product.featured_image.alt ?? product.title}
                    className="aspect-square w-full rounded-[var(--page-radius)] object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-[var(--page-radius)] bg-black/5" />
                )}
                <div>
                  <p className="font-medium group-hover:underline">
                    {product.title}
                  </p>
                  <p className="opacity-70">
                    {product.price_varies
                      ? `From ${formatMoney(product.price_min, currency)}`
                      : formatMoney(product.price, currency)}
                  </p>
                  {!product.available && (
                    <p className="text-sm opacity-50">Sold out</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <nav className="mt-12 flex justify-between">
          {pageNumber > 1 ? (
            <Link
              href={`/collections/${handle}?page=${pageNumber - 1}`}
              className="underline"
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          {collection.products.length === PAGE_SIZE && (
            <Link
              href={`/collections/${handle}?page=${pageNumber + 1}`}
              className="underline"
            >
              Next
            </Link>
          )}
        </nav>
      </div>
    </PageThemeProvider>
  )
}
