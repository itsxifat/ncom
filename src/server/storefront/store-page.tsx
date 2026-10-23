import 'server-only'
import type { ReactNode } from 'react'
import { env } from '@/lib/env'
import {
  getPublishedRolePage,
  type CachedStore,
} from '@/server/services/publishService'
import {
  loadStoreCatalogue,
  resolveSectionProducts,
  type StoreCatalogue,
} from '@/server/services/storefrontService'
import {
  getSectionDefinition,
  sectionDefaults,
} from '@/modules/sections/registry'
import type { RenderablePageSection } from '@/modules/sections/PageRenderer'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { PageThemeProvider } from '@/modules/sections/theme'
import type { PageTheme } from '@/modules/sections/types'
import type { SiteLanguage } from '@/modules/sections/language'
import type {
  StoreListing,
  StoreProductDetail,
  StorefrontContext,
} from '@/modules/sections/storefront'
import { CartProvider } from '@/modules/storefront/CartProvider'

/**
 * How an online store's pages are put together on the live site.
 *
 * Every page a shopper sees is the store's layout (announcement bar and header
 * on top, footer underneath) around that page's own blocks — the home page's,
 * the product page design's, the catalogue design's — or around one of the
 * store's own screens: the cart, the checkout, the account pages. The layout
 * is published with the site, so it changes for every page at once.
 */

export type StoreSection = RenderablePageSection & { type: string }

/**
 * A section built from a block's defaults, for designs never published — in
 * the store's language, so a Bangla shop whose header was never published does
 * not greet shoppers with "Home / Shop" above its Bangla home page.
 */
function fallbackSection(type: string, language: SiteLanguage): StoreSection {
  return {
    id: `default-${type}`,
    order: 0,
    type,
    content: sectionDefaults(type, language),
    config: {},
    isVisible: true,
  }
}

/**
 * The shared top and bottom of every page.
 *
 * A store published before its layout existed — or whose layout was never
 * published — still gets a header and a footer from the blocks' defaults, so
 * the shop is never a page floating with no way back to the home page.
 */
export async function loadStoreLayout(
  storeId: string,
  language: SiteLanguage
): Promise<{
  pageId: string | null
  top: StoreSection[]
  bottom: StoreSection[]
}> {
  const layout = await getPublishedRolePage(storeId, 'LAYOUT')
  const sections: StoreSection[] = layout
    ? (layout.snapshot.sections as StoreSection[])
    : [fallbackSection('header', language), fallbackSection('footer', language)]

  const placed = (where: 'top' | 'bottom') =>
    sections.filter(
      (section) =>
        section.isVisible &&
        getSectionDefinition(section.type)?.placement === where
    )

  return {
    pageId: layout?.id ?? null,
    top: placed('top'),
    bottom: placed('bottom'),
  }
}

const FALLBACK_TITLES: Record<
  'PRODUCT' | 'CATALOG',
  Record<SiteLanguage, string>
> = {
  PRODUCT: { en: 'Product', bn: 'পণ্য' },
  CATALOG: { en: 'Products', bn: 'পণ্যসমূহ' },
}

/**
 * The product page design or the catalogue design, as published — or the
 * block that page cannot do without, when it never was.
 */
export async function loadRoleDesign(
  storeId: string,
  role: 'PRODUCT' | 'CATALOG',
  language: SiteLanguage
): Promise<{ pageId: string | null; title: string; sections: StoreSection[] }> {
  const published = await getPublishedRolePage(storeId, role)
  if (published) {
    return {
      pageId: published.id,
      title: published.snapshot.title,
      sections: published.snapshot.sections as StoreSection[],
    }
  }
  return {
    pageId: null,
    title: FALLBACK_TITLES[role][language],
    sections:
      role === 'PRODUCT'
        ? [
            fallbackSection('productdetails', language),
            fallbackSection('relatedproducts', language),
          ]
        : [fallbackSection('productlisting', language)],
  }
}

/** The `perPage` the catalogue design asks for, so the listing pages right. */
export function listingPerPage(sections: StoreSection[]): number {
  const listing = sections.find((section) => section.type === 'productlisting')
  const perPage = (listing?.content as { perPage?: unknown } | undefined)
    ?.perPage
  return typeof perPage === 'number' ? perPage : 24
}

/** Everything a store's blocks read, assembled once per request. */
export async function buildStorefront(input: {
  store: CachedStore
  sections: StoreSection[]
  catalogue?: StoreCatalogue
  product?: StoreProductDetail | null
  listing?: StoreListing | null
}): Promise<StorefrontContext> {
  const catalogue =
    input.catalogue ?? (await loadStoreCatalogue(input.store.organizationId))
  const { sectionProducts, unavailable } = await resolveSectionProducts(
    input.store.organizationId,
    input.sections.filter((section) => section.isVisible),
    input.product
  )

  return {
    storeName: input.store.name,
    currencyCode: catalogue.currencyCode,
    linkBase: '',
    categories: catalogue.categories,
    collections: catalogue.collections,
    sectionProducts,
    product: input.product ?? null,
    listing: input.listing ?? null,
    accountsEnabled: catalogue.accountsEnabled,
    catalogUnavailable: unavailable || !catalogue.catalogueAvailable,
  }
}

/**
 * A store page: the layout, the page's blocks, and the cart around them.
 *
 * One themed document holding three runs of blocks — header, page, footer —
 * with the middle one stretched, so a short page (an empty cart, a sign-in
 * form) still puts the footer at the bottom of the screen rather than halfway
 * up it.
 *
 * `children` is for the store's own screens — the cart, the checkout, the
 * account pages — which sit between the header and the footer in place of a
 * page's blocks, painted by the same theme.
 */
export function StoreDocument({
  theme,
  storeId,
  storefront,
  top,
  sections = [],
  bottom,
  scripts,
  children,
}: {
  theme: PageTheme
  storeId: string
  storefront: StorefrontContext
  top: StoreSection[]
  sections?: StoreSection[]
  bottom: StoreSection[]
  scripts?: ReactNode
  children?: ReactNode
}) {
  const run = (list: StoreSection[]) => (
    <PageRenderer
      bare
      theme={theme}
      sections={list}
      storeId={storeId}
      storefront={storefront}
    />
  )

  return (
    // The cart sits inside the themed document, not around it: its drawer is
    // painted from the same `--page-*` colours as the blocks, and outside the
    // theme those are undefined — a see-through drawer with a blank button.
    <PageThemeProvider
      theme={theme}
      className="flex min-h-svh flex-col scroll-smooth"
    >
      <CartProvider
        currencyCode={storefront.currencyCode}
        linkBase={storefront.linkBase}
      >
        {scripts}
        {run(top)}
        <main className="flex flex-1 flex-col">
          {children ?? run(sections)}
        </main>
        {run(bottom)}
      </CartProvider>
    </PageThemeProvider>
  )
}

/** The store's own address, for metadata and tracking. */
export function storeOrigin(store: { subdomain: string }): string {
  return `http://${store.subdomain}.${env.ROOT_DOMAIN}`
}
