import 'server-only'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { DEFAULT_THEME } from '@/lib/default-theme'
import {
  getPublishedPageForRender,
  resolvePublicStore,
  type CachedStore,
} from '@/server/services/publishService'
import { getStorefrontCommerce } from '@/server/services/offerService'
import {
  getStoreListing,
  getStoreProduct,
  loadStoreCatalogue,
  type ListingRequest,
} from '@/server/services/storefrontService'
import type { PageOfferSnapshot } from '@/server/services/trackingService'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import type { PageTheme } from '@/modules/sections/types'
import { richTextToPlain } from '@/modules/sections/sanitizeHtml'
import { siteLanguage } from '@/modules/sections/language'
import { prepareVisit } from './visit'
import { storeText, type StoreWords } from '@/modules/storefront/i18n'
import {
  buildStorefront,
  listingPerPage,
  loadRoleDesign,
  loadStoreLayout,
  StoreDocument,
  type StoreSection,
} from './store-page'

/**
 * Turns a public request into a page.
 *
 * Three shapes of page come through here. A landing site's page is its blocks
 * and nothing else, exactly as it always was. A store's own page — the home
 * page, an "About us" — is the same blocks inside the store's header and
 * footer. And a store's product, category, collection and search pages are a
 * design (the product page, the catalogue page) filled in with whatever the
 * address names.
 */

function themeOf(store: CachedStore, fallback?: PageTheme): PageTheme {
  return store.theme ?? fallback ?? (DEFAULT_THEME as PageTheme)
}

async function loadIntegration(storeId: string) {
  return prisma.storeIntegrationConfig.findUnique({ where: { storeId } })
}

function hostOf(store: CachedStore): string {
  return `${store.subdomain}.${env.ROOT_DOMAIN}`
}

// ── Standard pages ───────────────────────────────────────────────────────

export async function renderSitePage(handle: string, path: string[]) {
  const result = await getPublishedPageForRender(handle, path)
  if (!result) notFound()

  const { store, page, snapshot, theme, integration } = result
  const sections = snapshot.sections as StoreSection[]
  const visitPath = `/${path.join('/')}`

  if (store.kind === 'STORE') {
    const layout = await loadStoreLayout(store.id, siteLanguage(theme))
    const storefront = await buildStorefront({
      store,
      sections: [...layout.top, ...sections, ...layout.bottom],
    })
    const visit = await prepareVisit({
      store,
      integration,
      pageId: page.id,
      pageTitle: snapshot.seoTitle || snapshot.title,
      path: visitPath,
      sections,
      offer: null,
      fallbackHost: hostOf(store),
    })
    if (visit.blocked) return visit.blocked

    return (
      <StoreDocument
        theme={theme}
        storeId={store.id}
        storefront={storefront}
        top={layout.top}
        sections={sections}
        bottom={layout.bottom}
        scripts={visit.scripts}
      />
    )
  }

  // What this page sells, resolved once and handed to every section so the
  // order form, the bundle cards and the sticky bar all quote the same prices.
  const commerce = await getStorefrontCommerce(
    page.id,
    store.id,
    store.organizationId
  )
  const visit = await prepareVisit({
    store,
    integration,
    pageId: page.id,
    pageTitle: snapshot.seoTitle || snapshot.title,
    path: visitPath,
    sections,
    offer: offerSnapshot(commerce),
    fallbackHost: hostOf(store),
  })
  if (visit.blocked) return visit.blocked

  return (
    <>
      {visit.scripts}
      <PageRenderer
        theme={theme}
        sections={sections}
        storeId={store.id}
        commerce={commerce}
      />
    </>
  )
}

export async function siteMetadata(
  handle: string,
  path: string[]
): Promise<Metadata> {
  const result = await getPublishedPageForRender(handle, path)
  if (!result) return {}

  const { snapshot, theme, store } = result
  const url = `http://${hostOf(store)}/${path.join('/')}`
  const title = snapshot.seoTitle || snapshot.title

  return {
    title:
      store.kind === 'STORE' && path.length > 0
        ? `${title} | ${store.name}`
        : title,
    description: snapshot.seoDescription ?? undefined,
    alternates: { canonical: url },
    robots: snapshot.robotsIndex ? undefined : { index: false, follow: false },
    // From the store's live theme, not the snapshot's copy: a merchant who
    // changes their favicon expects the tab icon to follow, and it is the one
    // piece of branding they cannot see change by looking at the page.
    icons: theme.faviconUrl ? { icon: theme.faviconUrl } : undefined,
    openGraph: {
      title,
      description: snapshot.seoDescription ?? undefined,
      url,
      images: snapshot.ogImageUrl ? [snapshot.ogImageUrl] : undefined,
    },
    twitter: {
      card: snapshot.ogImageUrl ? 'summary_large_image' : 'summary',
      title,
      description: snapshot.seoDescription ?? undefined,
      images: snapshot.ogImageUrl ? [snapshot.ogImageUrl] : undefined,
    },
  }
}

/**
 * What a landing page is selling, for the product-view event.
 *
 * The default offer, because that is the one the page leads with and the one
 * a visitor is looking at before they touch anything. Null when the page sells
 * nothing, so a content page does not report a product view of nothing.
 */
function offerSnapshot(
  commerce: Awaited<ReturnType<typeof getStorefrontCommerce>>
): PageOfferSnapshot | null {
  const offer =
    commerce.offers.find((candidate) => candidate.isDefault) ??
    commerce.offers[0]
  if (!offer) return null

  // A FIXED offer's own lines, or the pool a buyer would pick from. Each
  // product contributes its first variant: the event describes what the page
  // shows, and the page shows one price per product until a choice is made.
  const lines = offer.items.length > 0 ? offer.items : offer.pool

  return {
    currencyCode: commerce.currencyCode,
    headlinePriceCents: offer.headlinePriceCents,
    items: lines.flatMap((line) => {
      const variant = line.variants[0]
      if (!variant) return []
      return [
        {
          id: variant.id,
          name: line.title,
          quantity: line.quantity || 1,
          priceCents: variant.priceCents,
        },
      ]
    }),
  }
}

// ── A store's catalogue routes ───────────────────────────────────────────

/**
 * The store at this handle, or null when it is a landing site.
 *
 * A landing site has no `/products` or `/cart`; on one of those, these routes
 * hand the path back to the standard page renderer, so a landing page a
 * merchant happened to give the slug "products" years ago still answers.
 */
export async function storeForRoute(handle: string) {
  const store = await resolvePublicStore(handle)
  if (!store) notFound()
  return store.kind === 'STORE' ? store : null
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function renderProductPage(handle: string, productHandle: string) {
  const store = await storeForRoute(handle)
  if (!store) return renderSitePage(handle, ['products', productHandle])

  const language = siteLanguage(themeOf(store))
  const [product, design, layout, integration] = await Promise.all([
    getStoreProduct(store.organizationId, decode(productHandle)),
    loadRoleDesign(store.id, 'PRODUCT', language),
    loadStoreLayout(store.id, language),
    loadIntegration(store.id),
  ])
  if (!product) notFound()

  const storefront = await buildStorefront({
    store,
    sections: [...layout.top, ...design.sections, ...layout.bottom],
    product,
  })

  const firstVariant =
    product.variants.find((variant) => variant.available) ?? product.variants[0]
  const visit = await prepareVisit({
    store,
    integration,
    pageId: design.pageId ?? layout.pageId ?? store.id,
    pageTitle: product.title,
    path: `/products/${product.handle}`,
    sections: design.sections,
    offer: firstVariant
      ? {
          currencyCode: storefront.currencyCode,
          headlinePriceCents: firstVariant.priceCents,
          items: [
            {
              id: firstVariant.id,
              name: product.title,
              quantity: 1,
              priceCents: firstVariant.priceCents,
            },
          ],
        }
      : null,
    fallbackHost: hostOf(store),
  })
  if (visit.blocked) return visit.blocked

  return (
    <StoreDocument
      theme={themeOf(store)}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      sections={design.sections}
      bottom={layout.bottom}
      scripts={visit.scripts}
    />
  )
}

export async function productMetadata(
  handle: string,
  productHandle: string
): Promise<Metadata> {
  const store = await resolvePublicStore(handle)
  if (!store || store.kind !== 'STORE')
    return siteMetadata(handle, ['products', productHandle])
  const product = await getStoreProduct(
    store.organizationId,
    decode(productHandle)
  )
  if (!product) return {}
  const description = richTextToPlain(product.descriptionHtml).slice(0, 160)
  const url = `http://${hostOf(store)}/products/${product.handle}`
  return {
    title: `${product.title} | ${store.name}`,
    description: description || undefined,
    alternates: { canonical: url },
    icons: store.theme?.faviconUrl
      ? { icon: store.theme.faviconUrl }
      : undefined,
    openGraph: {
      title: product.title,
      description: description || undefined,
      url,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  }
}

export async function renderListingPage(
  handle: string,
  request: ListingRequest,
  fallbackPath: string[]
) {
  const store = await storeForRoute(handle)
  if (!store) return renderSitePage(handle, fallbackPath)

  const language = siteLanguage(themeOf(store))
  const [design, layout, integration, catalogue] = await Promise.all([
    loadRoleDesign(store.id, 'CATALOG', language),
    loadStoreLayout(store.id, language),
    loadIntegration(store.id),
    loadStoreCatalogue(store.organizationId),
  ])

  const listing = await getStoreListing(
    store.organizationId,
    {
      ...request,
      handle: request.handle ? decode(request.handle) : request.handle,
      perPage: listingPerPage(design.sections),
    },
    catalogue
  )
  if (!listing) notFound()

  const storefront = await buildStorefront({
    store,
    sections: [...layout.top, ...design.sections, ...layout.bottom],
    catalogue,
    listing,
  })

  const visit = await prepareVisit({
    store,
    integration,
    pageId: design.pageId ?? layout.pageId ?? store.id,
    pageTitle: listing.title,
    path: `/${fallbackPath.join('/')}`,
    sections: design.sections,
    offer: null,
    fallbackHost: hostOf(store),
  })
  if (visit.blocked) return visit.blocked

  return (
    <StoreDocument
      theme={themeOf(store)}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      sections={design.sections}
      bottom={layout.bottom}
      scripts={visit.scripts}
    />
  )
}

/**
 * A store listing's tab title. `fallbackPath` is the address the route
 * answers on: on a landing site it is one of the merchant's own pages, which
 * keeps its own SEO title, description and indexing — the same hand-back the
 * page body makes. `extra` is for the store listing only, never that page.
 */
export async function listingMetadata(
  handle: string,
  fallbackPath: string[],
  title: (store: CachedStore) => Promise<string | null>,
  extra: Metadata = {}
): Promise<Metadata> {
  const store = await resolvePublicStore(handle)
  if (!store || store.kind !== 'STORE')
    return siteMetadata(handle, fallbackPath)
  const name = await title(store)
  return {
    title: name ? `${name} | ${store.name}` : store.name,
    icons: store.theme?.faviconUrl
      ? { icon: store.theme.faviconUrl }
      : undefined,
    ...extra,
  }
}

/**
 * The tab title of one of a store's own screens — the cart, the checkout, the
 * account pages — in the shop's language. Never indexed: they are the same
 * page for every shop and say nothing a search engine should show.
 *
 * On a landing site the address is one of the merchant's own pages — a page
 * they called "checkout" before stores existed — so it keeps that page's own
 * metadata and indexing, found at `fallbackPath`, as its body does.
 */
export async function storeScreenMetadata(
  handle: string,
  fallbackPath: string[],
  title: (words: StoreWords) => string
): Promise<Metadata> {
  const store = await resolvePublicStore(handle)
  if (!store || store.kind !== 'STORE')
    return siteMetadata(handle, fallbackPath)
  return {
    title: title(storeText(store.theme).words),
    robots: { index: false, follow: false },
  }
}

/** Reads `?page=` defensively: a typed "abc" is page one, not an error. */
export function pageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number(raw)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function stringParam(
  value: string | string[] | undefined
): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw ?? null
}

/**
 * The layout and catalogue a store's own screens (cart, checkout, account)
 * are drawn inside.
 */
export async function storeChrome(store: CachedStore) {
  const theme = themeOf(store)
  const layout = await loadStoreLayout(store.id, siteLanguage(theme))
  const storefront = await buildStorefront({
    store,
    sections: [...layout.top, ...layout.bottom],
  })
  return { layout, storefront, theme }
}
