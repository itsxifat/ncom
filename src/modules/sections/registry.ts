import type { ZodType } from 'zod'
import type { ComponentType } from 'react'
import type { PageTheme, SectionConfig } from './types'
import type { FieldConfig } from './editorFields'
import type { ElementDescriptor } from './elementDescriptors'
import type {
  PublicOffer,
  PublicPromotions,
  PublicShipping,
} from '@/lib/offers/types'
import type {
  PageRole,
  SiteKind,
  StorefrontContext,
  StorefrontProductQuery,
} from './storefront'
import type { SiteLanguage } from './language'

export interface SectionRendererProps<T> {
  content: T
  config?: SectionConfig
  theme: PageTheme
  /**
   * The PageSection id. Passed so a section can scope styles or scripts to its
   * own instance.
   */
  sectionId?: string
  /**
   * The store this page belongs to. Needed only by sections that talk to the
   * commerce API — the order form posts it so the endpoint can confirm the
   * form was served from that store's own hostname.
   */
  storeId?: string
  /**
   * What this page sells, resolved from the database.
   *
   * Undefined in contexts with no real page behind them. A section that needs
   * to sell must handle its absence rather than assuming a page is always
   * there.
   */
  commerce?: StorefrontCommerce
  /**
   * True only inside the builder canvas.
   *
   * A block that renders nothing when it is not configured yet is invisible on
   * the canvas, which reads as a broken block rather than an unfinished one —
   * the merchant drops it on the page, sees nothing appear, and has no target
   * to click to open the inspector. Blocks with that property use this to draw
   * a placeholder while editing and stay honest on the published page.
   *
   * It is not set for the preview routes: a preview is meant to answer "what
   * will a customer see", so it must show exactly what the live page shows.
   */
  editing?: boolean
  /**
   * The shop around this block, on an online store.
   *
   * Undefined on a landing page, which has no catalogue to browse. A block
   * that only makes sense in a store (a product grid, the header's cart) must
   * still render something honest without it rather than assume it is there.
   */
  storefront?: StorefrontContext
}

/**
 * The live commerce context of one landing page.
 *
 * Resolved once per render and handed to every section, so the order form and
 * every other selling surface quote the same prices from the same read.
 * Sections receiving this must still treat it as display data: the authority on
 * what anything costs is the order route, which recomputes everything from the
 * database when the buyer submits.
 */
export interface StorefrontCommerce {
  pageId: string
  storeId: string
  currencyCode: string
  offers: PublicOffer[]
  shipping: PublicShipping
  promotions: PublicPromotions
  /**
   * The merchant's website did not answer this render, so there is nothing to
   * sell — as distinct from a page whose merchant has not built an offer yet.
   *
   * Two different sentences for the shopper and two different actions for the
   * merchant, which is why sections are told which one happened rather than
   * being handed an empty list and left to guess.
   */
  catalogUnavailable?: boolean
}

export interface SectionDefinition<T = unknown> {
  key: string
  name: string
  category: string
  /** One line for the block palette, explaining what the block is for. */
  description?: string
  /**
   * Blocks a page must always contain exactly one of. The order form is the
   * only one: a landing page with no way to buy is not a landing page, and two
   * order forms means two carts on one funnel.
   */
  singleton?: boolean
  /**
   * Which kinds of site offer this block. Unset means both.
   *
   * The order form is landing-only: a store sells through its cart, and a
   * second, separate way to buy on the same site is two funnels that report
   * against each other. The product blocks are store-only, because a landing
   * page has no catalogue pages for them to link into.
   */
  sites?: SiteKind[]
  /**
   * Which pages it can be placed on. Unset means every page a visitor sees —
   * standard pages, the product page and the catalogue page — but never the
   * layout, which holds only the blocks made for it.
   */
  pageRoles?: PageRole[]
  /**
   * For layout blocks: whether it is drawn above every page or below it. The
   * header and announcement bar sit on top, the footer underneath; that is
   * decided by what the block is, not by where a merchant dragged it.
   */
  placement?: 'top' | 'bottom'
  /**
   * A block a page of this role cannot do without — the product page's
   * product details, the catalogue page's product grid. It can be restyled and
   * moved but not removed, because the page is meaningless without it.
   */
  requiredOn?: PageRole
  /**
   * The products this block shows, so the page can load them before it
   * renders. See `StorefrontProductQuery` for why a block cannot fetch its own.
   */
  productQuery?: (content: T) => StorefrontProductQuery | null
  /**
   * Classes for the element that holds the block on the page.
   *
   * For the rare block whose behaviour belongs to its slot rather than its own
   * markup: a sticky header has to stick its *container*, because a sticky
   * element is confined to its parent and the parent here is exactly as tall
   * as the header.
   */
  wrapperClassName?: (content: T) => string | undefined
  /** Words people might search the block library with — "carousel", "banner". */
  keywords?: string[]
  schema: ZodType<T>
  defaultContent: T
  /**
   * The block's starting words in another language, laid over
   * `defaultContent` when the block is added to a site in that language.
   *
   * Only words: a translation that changed a layout or a number would make
   * the same block look different depending on the language it was added in.
   * Anything a translation leaves out keeps the English default, so a partial
   * translation still produces a valid block.
   */
  translations?: Partial<Record<SiteLanguage, Partial<T>>>
  editorFields: FieldConfig[]
  /**
   * The individually styleable things this block draws.
   *
   * Every key here must match a `data-el` the renderer emits, and every
   * `data-el` the renderer emits should appear here — the first direction is
   * what makes a merchant's styling land on anything, the second is what stops
   * an element existing on the page that the editor cannot select or name.
   *
   * A block with an empty list still works; it is simply not customisable
   * below the section wrapper.
   */
  elements: ElementDescriptor[]
  /**
   * Where merchant-added elements go, in the order the editor offers them.
   *
   * Blocks render each slot with `<Extras slot="…" />`. Most declare the single
   * default slot; a block with genuinely distinct regions (the hero's text
   * stack versus its full-bleed frame) declares more so "add a button" can ask
   * which one.
   */
  slots?: { key: string; label: string }[]
  Renderer: ComponentType<SectionRendererProps<T>>
}

import { heroSection } from './hero'
import { richtextSection } from './richtext'
import { imageSection } from './image'
import { ctaSection } from './cta'
import { gallerySection } from './gallery'
import { featuresSection } from './features'
import { videoSection } from './video'
import { countdownSection } from './countdown'
import { testimonialsSection } from './testimonials'
import { trustSection } from './trust'
import { faqSection } from './faq'
import { orderformSection } from './orderform'
import { dividerSection } from './divider'
import { headerSection } from './header'
import { announcementSection } from './announcement'
import { footerSection } from './footer'
import { productsSection } from './products'
import { productDetailsSection } from './productdetails'
import { productListingSection } from './productlisting'
import { relatedProductsSection } from './relatedproducts'
import { sliderSection } from './slider'
import { categoriesSection } from './categories'
import { promosSection } from './promos'
import { customcodeSection } from './customcode'

/**
 * The block library.
 *
 * Deliberately small and entirely React. This platform builds cash-on-delivery
 * landing pages, and every block a merchant can reach has to either sell, prove
 * or explain. There is no template language behind any of it: a block is a
 * schema, a set of defaults, a field list and a component, all in TypeScript,
 * which is what makes the palette, the inspector, the canvas and the published
 * page four views of one definition rather than four things to keep in sync.
 *
 * Adding a block means adding a module here and nothing else — no migration,
 * because a section stores its `type` key and a JSON `content` blob.
 */
export const sectionRegistry = {
  hero: heroSection,
  richtext: richtextSection,
  image: imageSection,
  cta: ctaSection,
  gallery: gallerySection,
  features: featuresSection,
  video: videoSection,
  countdown: countdownSection,
  testimonials: testimonialsSection,
  trust: trustSection,
  faq: faqSection,
  orderform: orderformSection,
  divider: dividerSection,
  // Both kinds of site: the merchant's own HTML and CSS, sanitised and
  // drawn in a shadow root. See customcode/index.tsx.
  customcode: customcodeSection,
  // Online store blocks. Store-only (`sites`), and the layout, product and
  // catalogue blocks are further limited to their own page (`pageRoles`).
  announcement: announcementSection,
  header: headerSection,
  footer: footerSection,
  slider: sliderSection,
  categories: categoriesSection,
  promos: promosSection,
  products: productsSection,
  productdetails: productDetailsSection,
  productlisting: productListingSection,
  relatedproducts: relatedProductsSection,
  // Each entry is a SectionDefinition<T> for its own content type; a
  // uniform type parameter here is structurally impossible (Renderer's
  // prop position is contravariant), so this is the standard escape hatch
  // for a heterogeneous plugin/registry collection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<string, SectionDefinition<any>>

/**
 * Fails at import time if a section module is not server-safe.
 *
 * A section module marked `'use client'` has its exports replaced with client
 * reference proxies in the server bundle: `sectionRegistry[key]` is still
 * truthy, but `schema` and `Renderer` come back undefined, and the failure
 * surfaces as "Cannot read properties of undefined (reading 'safeParse')" deep
 * inside PageRenderer with nothing pointing at the section that caused it.
 *
 * This turns that into an immediate, named error. A section needing
 * interactivity keeps its definition here and puts the client half in a
 * separate `'use client'` file — see order form and countdown for the pattern.
 */
for (const [key, definition] of Object.entries(sectionRegistry)) {
  if (!definition?.schema || !definition?.Renderer) {
    throw new Error(
      `Section "${key}" is missing schema/Renderer. This usually means its ` +
        `module is marked 'use client' — move the interactive part into a ` +
        `separate client file and keep the definition server-safe.`
    )
  }
  if (!Array.isArray(definition?.elements)) {
    throw new Error(
      `Section "${key}" does not declare an \`elements\` list. Add one (it may ` +
        `be empty) so the builder can name what the block draws.`
    )
  }
}

export type SectionKey = keyof typeof sectionRegistry

export const SECTION_KEYS = Object.keys(sectionRegistry) as SectionKey[]

/** Block types a page must always contain exactly one of. */
export const SINGLETON_SECTION_KEYS = SECTION_KEYS.filter(
  (key) => sectionRegistry[key].singleton
)

export function getSectionDefinition(
  key: string
): SectionDefinition | undefined {
  return sectionRegistry[key as SectionKey] as SectionDefinition | undefined
}

export function isSectionKey(key: string): key is SectionKey {
  return Object.prototype.hasOwnProperty.call(sectionRegistry, key)
}

/**
 * Whether a block belongs in the library for this page.
 *
 * One rule for the library, the canvas's "+" menus and the server-side check
 * that refuses a section the page cannot hold, so the three cannot disagree.
 */
export function blockFitsPage(
  definition: SectionDefinition,
  site: SiteKind,
  role: PageRole
): boolean {
  if (definition.sites && !definition.sites.includes(site)) return false
  if (role === 'LAYOUT')
    return definition.pageRoles?.includes('LAYOUT') ?? false
  if (definition.pageRoles) return definition.pageRoles.includes(role)
  return true
}

/**
 * A block's defaults in a site's language: the English defaults with the
 * block's translation for that language laid over them. A fresh copy, safe to
 * mutate.
 */
export function localizedDefaults(
  definition: Pick<SectionDefinition, 'defaultContent' | 'translations'>,
  language: SiteLanguage = 'en'
): Record<string, unknown> {
  const base = structuredClone(definition.defaultContent) as Record<
    string,
    unknown
  >
  const translation =
    language === 'en' ? undefined : definition.translations?.[language]
  if (!translation) return base
  return { ...base, ...structuredClone(translation as object) }
}

/** A fresh copy of a block's defaults, safe to mutate. */
export function sectionDefaults(
  key: string,
  language: SiteLanguage = 'en'
): Record<string, unknown> {
  const definition = getSectionDefinition(key)
  if (!definition) return {}
  return localizedDefaults(definition, language)
}
