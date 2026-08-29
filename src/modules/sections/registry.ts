import type { ZodType } from 'zod'
import type { ComponentType } from 'react'
import type { PageTheme, SectionConfig } from './types'
import type { FieldConfig } from './editorFields'
import type {
  PublicOffer,
  PublicPromotions,
  PublicShipping,
} from '@/lib/offers/types'

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
  schema: ZodType<T>
  defaultContent: T
  editorFields: FieldConfig[]
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

/** A fresh copy of a block's defaults, safe to mutate. */
export function sectionDefaults(key: string): Record<string, unknown> {
  const definition = getSectionDefinition(key)
  if (!definition) return {}
  return structuredClone(definition.defaultContent) as Record<string, unknown>
}
