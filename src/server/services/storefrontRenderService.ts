import 'server-only'
import { prisma } from '@/server/db/client'
import { renderLiquid } from '@/lib/liquid/engine'
import {
  buildProductDrop,
  type CartDrop,
  type CollectionDrop,
  type ImageDrop,
  type LineItemDrop,
  type ProductDrop,
  type ProductSource,
  type StorefrontScope,
} from '@/lib/liquid/drops'
import { buildShopDrop, loadStoreSnippets } from './storefrontService'
import { resolveSiteHandle } from './siteHandleService'
import { getAvailability } from './inventoryService'
import { getCollectionProducts } from './collectionService'
import type { CartWithPricing } from './cartService'
import type { StorefrontTemplateType } from '@/generated/prisma/enums'

/**
 * Renders the storefront routes that are generated from data rather than
 * composed in the builder — product pages, collection pages, the cart.
 *
 * These read published Liquid (`StorefrontTemplate.publishedSource`), not the
 * draft, so an unfinished edit cannot reach a live store. Unlike builder pages
 * these cannot be compiled ahead of time: their content depends on the request
 * (which product, whose cart), so the sandbox does run per request here. That
 * is exactly why the engine's limits in lib/liquid/engine.ts are set the way
 * they are.
 */

const PRODUCT_QUERY_INCLUDE = {
  options: { orderBy: { position: 'asc' as const } },
  images: {
    orderBy: { position: 'asc' as const },
    include: { media: { select: { url: true, width: true, height: true } } },
  },
  variants: { orderBy: { position: 'asc' as const } },
} as const

/**
 * Loads a product and attaches live stock counts to its variants.
 *
 * Availability is fetched in one grouped query for the whole product rather
 * than per variant — a product with 50 variants would otherwise issue 50
 * queries to render one page.
 */
export async function loadProductDrop(
  organizationId: string,
  handle: string,
  options: { selectedVariantId?: string } = {}
): Promise<ProductDrop | null> {
  const product = await prisma.product.findFirst({
    where: { organizationId, handle, status: 'ACTIVE' },
    include: PRODUCT_QUERY_INCLUDE,
  })
  if (!product) return null

  const availability = await getAvailability(
    product.variants.map((variant) => variant.id)
  )

  const source: ProductSource = {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      availableQuantity: availability.get(variant.id) ?? 0,
    })),
  }

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { weightUnit: true },
  })

  return buildProductDrop(source, {
    weightUnit: weightUnitSymbol(settings?.weightUnit ?? 'GRAM'),
    selectedVariantId: options.selectedVariantId,
  })
}

function weightUnitSymbol(unit: string): string {
  switch (unit) {
    case 'KILOGRAM':
      return 'kg'
    case 'OUNCE':
      return 'oz'
    case 'POUND':
      return 'lb'
    default:
      return 'g'
  }
}

export async function loadCollectionDrop(
  organizationId: string,
  handle: string,
  options: { take?: number; skip?: number } = {}
): Promise<CollectionDrop | null> {
  const collection = await prisma.collection.findFirst({
    where: { organizationId, handle },
  })
  if (!collection) return null

  const products = await getCollectionProducts(organizationId, collection.id, {
    take: options.take ?? 24,
    skip: options.skip ?? 0,
    publishedOnly: true,
  })

  const variantIds = products.flatMap((product) =>
    product.variants.map((variant) => variant.id)
  )
  const availability = await getAvailability(variantIds)

  const image = collection.imageMediaId
    ? await prisma.mediaAsset.findUnique({
        where: { id: collection.imageMediaId },
        select: { id: true, url: true, width: true, height: true },
      })
    : null

  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    description: collection.description,
    url: `/collections/${collection.handle}`,
    image: image
      ? {
          id: image.id,
          src: image.url,
          alt: collection.title,
          width: image.width,
          height: image.height,
          position: 0,
        }
      : null,
    products: products.map((product) =>
      buildProductDrop({
        ...product,
        variants: product.variants.map((variant) => ({
          ...variant,
          availableQuantity: availability.get(variant.id) ?? 0,
        })),
      } as ProductSource)
    ),
    products_count: products.length,
    all_products_count: products.length,
    seo_title: collection.seoTitle,
    seo_description: collection.seoDescription,
  }
}

/** Maps the priced cart the services return onto the Liquid `cart` drop. */
export function buildCartDrop(cart: CartWithPricing): CartDrop {
  const pricedById = new Map(cart.pricing.lines.map((line) => [line.id, line]))

  const items: LineItemDrop[] = cart.lines.map((line) => {
    const priced = pricedById.get(line.id)
    const image: ImageDrop | null = line.imageUrl
      ? {
          id: line.variantId,
          src: line.imageUrl,
          alt: line.title,
          width: null,
          height: null,
          position: 0,
        }
      : null

    return {
      id: line.id,
      quantity: line.quantity,
      title: `${line.title}${line.variantTitle && line.variantTitle !== 'Default Title' ? ` - ${line.variantTitle}` : ''}`,
      price: line.unitPriceCents,
      line_price: line.unitPriceCents * line.quantity,
      original_line_price: line.unitPriceCents * line.quantity,
      final_line_price:
        priced?.totalCents ?? line.unitPriceCents * line.quantity,
      // The full product/variant drops are omitted here on purpose: loading
      // them for every cart line would issue a query per line on a page that
      // only needs the snapshot fields above.
      product: null,
      variant: null,
      product_title: line.title,
      variant_title: line.variantTitle,
      sku: line.sku,
      url: `/products/${line.handle}`,
      image,
      properties: (line.properties as Record<string, unknown>) ?? {},
      requires_shipping: true,
    }
  })

  return {
    id: cart.id,
    item_count: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    items,
    total_price: cart.pricing.totalCents,
    original_total_price: cart.pricing.subtotalCents,
    total_discount: cart.pricing.discountTotalCents,
    currency: cart.pricing.currencyCode,
    note: cart.note,
    empty: cart.lines.length === 0,
    requires_shipping: true,
    total_weight: cart.pricing.totalWeightGrams,
  }
}

export interface StorefrontRenderResult {
  html: string
  /** Null when the store has not published a template for this route. */
  missingTemplate: boolean
}

/**
 * Renders a storefront template.
 *
 * A store with no published template for the route is reported rather than
 * rendered blank, so the route can fall back to a built-in default instead of
 * serving an empty page.
 */
export async function renderStorefrontTemplate(
  // Store-scoped, unlike the catalogue helpers above: theme code, the shop drop
  // and the snippet library all describe one website.
  storeId: string,
  type: StorefrontTemplateType,
  scope: Omit<StorefrontScope, 'shop'>
): Promise<StorefrontRenderResult> {
  const [template, shop, snippets] = await Promise.all([
    prisma.storefrontTemplate.findUnique({
      where: { storeId_type: { storeId, type } },
      select: { publishedSource: true },
    }),
    buildShopDrop(storeId),
    loadStoreSnippets(storeId, { published: true }),
  ])

  if (!template?.publishedSource) {
    return { html: '', missingTemplate: true }
  }

  const { html, error } = await renderLiquid(
    template.publishedSource,
    { ...scope, shop, now: new Date().toISOString() },
    { snippets }
  )

  if (error) {
    // A visitor must never see a template error. The failure is logged for the
    // merchant and the route falls back to its built-in rendering.
    console.error(
      `Storefront template ${type} failed for store ${storeId}: ${error.message}`
    )
    return { html: '', missingTemplate: true }
  }

  return { html, missingTemplate: false }
}

/** Resolves a subdomain to a store, for the public commerce routes. */
/**
 * The store serving this hostname, plus the organisation behind it.
 *
 * Both are needed on every storefront route: the store supplies identity and
 * theme (it is the website), the organisation supplies the catalogue and
 * currency (it is the business). Callers pass `organizationId` to the commerce
 * services and `id` to anything about the site itself.
 */
export async function resolveStore(handle: string) {
  // `handle` is whatever the proxy put in the route's [subdomain] slot: either a
  // real subdomain or a tagged custom hostname. Resolving it here means every
  // storefront route keeps calling this one function and none of them need to
  // know which addressing scheme the visitor arrived through.
  const subdomain = await resolveSiteHandle(handle)
  if (!subdomain) return null

  return prisma.store.findFirst({
    where: { subdomain },
    select: {
      id: true,
      name: true,
      organizationId: true,
      isSearchIndexable: true,
      theme: true,
      organization: {
        select: { settings: { select: { currencyCode: true } } },
      },
    },
  })
}
