import 'server-only'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import {
  buildProductDrop,
  type CollectionDrop,
  type ProductDrop,
  type ShopDrop,
} from '@/lib/liquid/drops'

/**
 * Storefront-wide context for Liquid rendering.
 *
 * Note the two different scopes here, which is the whole shape of the platform:
 * the `shop` drop and the snippet library belong to a *store* (a website has a
 * name, a domain and its own theme code), while the catalogue belongs to the
 * *organisation* (one inventory, reused by every store it runs).
 *
 * Everything is read-only. These are called from the publish pipeline and the
 * builder preview, both of which already established that the caller may act on
 * the store, so they do not re-check authorization and must never be exposed
 * directly to a route handler.
 */

/**
 * Defaults for an organisation that has no settings row yet.
 *
 * Sections may call `| money` before a merchant has been through setup, so
 * `shop` has to resolve to something sane rather than throwing.
 */
const FALLBACK_CURRENCY = 'USD'
const FALLBACK_LOCALE = 'en-US'

export async function buildShopDrop(storeId: string): Promise<ShopDrop> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      name: true,
      subdomain: true,
      // Only verified domains, primary first: an unverified hostname does not
      // resolve to us yet, so canonical links and emails built from it would
      // point nowhere.
      customDomains: {
        where: { status: 'VERIFIED' },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { hostname: true },
      },
      // Commerce settings hang off the organisation now; the store supplies
      // only its own identity and address.
      organization: {
        select: {
          settings: {
            select: {
              currencyCode: true,
              supportEmail: true,
              supportPhone: true,
              businessName: true,
              customerAccountsEnabled: true,
            },
          },
        },
      },
    },
  })

  if (!store) throw new Error('Store not found')

  const domain =
    store.customDomains[0]?.hostname ?? `${store.subdomain}.${env.ROOT_DOMAIN}`

  const settings = store.organization.settings

  return {
    name: settings?.businessName ?? store.name,
    description: null,
    currency: settings?.currencyCode ?? FALLBACK_CURRENCY,
    locale: FALLBACK_LOCALE,
    url: `https://${domain}`,
    domain,
    email: settings?.supportEmail ?? null,
    phone: settings?.supportPhone ?? null,
    money_format: '{{amount}}',
    customer_accounts_enabled: settings?.customerAccountsEnabled ?? false,
  }
}

/**
 * How many products a builder page's Liquid scope carries.
 *
 * Page sections are compiled at publish time, so this is a one-off cost per
 * publish rather than per request — but the whole catalogue still has to be
 * serialisable and the sandbox has a memory ceiling. A landing page sells one
 * or two products; a storefront listing everything belongs on a collection
 * page, which queries per request and paginates.
 */
const CATALOG_LIMIT = 100

export interface CatalogScope {
  /** Active products, newest first. */
  products: ProductDrop[]
  /** Same products keyed by handle, for `all_products['my-product']`. */
  all_products: Record<string, ProductDrop>
  collections: CollectionDrop[]
}

/**
 * The organisation's catalogue, as Liquid drops.
 *
 * Organisation-scoped, not store-scoped: one inventory serves every storefront
 * the merchant runs, so the same product can be sold from a dedicated landing
 * page and from a general shop without being duplicated.
 *
 * Only published, active products are included. A draft product must not appear
 * on a live page, and the publish pipeline has no other filter in front of it.
 */
export async function buildCatalogScope(
  organizationId: string
): Promise<CatalogScope> {
  const [settings, products, collections] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { weightUnit: true },
    }),
    prisma.product.findMany({
      where: { organizationId, status: 'ACTIVE', publishedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: CATALOG_LIMIT,
      include: {
        options: { orderBy: { position: 'asc' } },
        images: {
          orderBy: { position: 'asc' },
          include: {
            media: { select: { url: true, width: true, height: true } },
          },
        },
        variants: { orderBy: { position: 'asc' } },
      },
    }),
    prisma.collection.findMany({
      where: { organizationId },
      orderBy: { title: 'asc' },
      take: CATALOG_LIMIT,
      select: {
        id: true,
        title: true,
        handle: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        _count: { select: { products: true } },
      },
    }),
  ])

  const weightUnit = settings?.weightUnit === 'POUND' ? 'lb' : 'g'

  const drops = products.map((product) =>
    buildProductDrop(product, { weightUnit })
  )

  const byHandle: Record<string, ProductDrop> = {}
  for (const drop of drops) byHandle[drop.handle] = drop

  return {
    products: drops,
    all_products: byHandle,
    collections: collections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      description: collection.description,
      url: `/collections/${collection.handle}`,
      image: null,
      // Products are not expanded here: doing so for every collection would
      // multiply the payload by the catalogue size. A section that needs a
      // collection's products reads them from `products` and filters, or lives
      // on a collection page where they are loaded per request.
      products: [],
      products_count: collection._count.products,
      all_products_count: collection._count.products,
      seo_title: collection.seoTitle,
      seo_description: collection.seoDescription,
    })),
  }
}

/**
 * Loads a store's Liquid snippets as the name -> source map the engine takes
 * as its in-memory `templates` option.
 *
 * This map *is* the sandbox's filesystem: `{% render 'x' %}` can only resolve
 * to a key present here, so scoping the query to one storeId is what stops a
 * template reaching another tenant's partials. Never merge snippets from more
 * than one store into a single engine.
 */
export async function loadStoreSnippets(
  storeId: string,
  options: { published: boolean }
): Promise<Record<string, string>> {
  const snippets = await prisma.liquidSnippet.findMany({
    where: { storeId },
    select: { name: true, source: true, publishedSource: true },
  })

  const map: Record<string, string> = {}

  for (const snippet of snippets) {
    // The published storefront reads publishedSource so an unpublished edit to
    // a shared snippet cannot leak into a live page; the builder reads the
    // draft so the author sees their work in progress.
    const source = options.published ? snippet.publishedSource : snippet.source
    if (typeof source === 'string') {
      map[snippet.name] = source
    }
  }

  return map
}
