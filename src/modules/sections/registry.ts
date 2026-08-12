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
   * own instance — the custom-code section uses it to stop one block's CSS
   * leaking onto the rest of the page.
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
   * Undefined in contexts with no real page behind them — the template gallery
   * preview renders a design, not a shop. A section that needs to sell must
   * handle its absence rather than assuming a page is always there.
   */
  commerce?: StorefrontCommerce
}

/**
 * The live commerce context of one landing page.
 *
 * Resolved once per render and handed to every section, so the order form, the
 * bundle picker and the sticky bar all quote the same prices from the same
 * read. Sections receiving this must still treat it as display data: the
 * authority on what anything costs is the order route, which recomputes
 * everything from the database when the buyer submits.
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
  schema: ZodType<T>
  defaultContent: T
  editorFields: FieldConfig[]
  Renderer: ComponentType<SectionRendererProps<T>>
}

import { textSection } from './text'
import { imageSection } from './image'
import { videoSection } from './video'
import { faqSection } from './faq'
import { footerSection } from './footer'
import { customCodeSection } from './custom-code'
import { orderFormSection } from './order-form'

/**
 * The React section library.
 *
 * Deliberately small. This platform builds cash-on-delivery landing pages, and
 * every section a merchant can reach has to either sell, prove or explain —
 * so the commerce sections live in `lib/liquid/builtin-sections` (Liquid,
 * because only Liquid sections are handed the catalogue) and what remains here
 * is the handful that Liquid cannot do:
 *
 *   - order-form and custom-code need React interactivity;
 *   - text, image, video, faq and footer are plain content primitives with no
 *     catalogue access to gain from being Liquid.
 *
 * Anything that duplicated a Liquid commerce section (testimonials → reviews,
 * pricing → bundle-offer, gallery → gallery-strip, features → guarantee) or was
 * brochure-ware from the pre-pivot website builder (navbar, hero, image-text,
 * services, cards, statistics, cta, contact, newsletter) has been removed. A
 * landing page has nothing to click but the order form; a nav bar full of exits
 * is a bug on an ad funnel, not a feature.
 */
export const sectionRegistry = {
  text: textSection,
  image: imageSection,
  video: videoSection,
  faq: faqSection,
  footer: footerSection,
  'custom-code': customCodeSection,
  'order-form': orderFormSection,
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
 * separate `'use client'` file — see order-form for the pattern.
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

export function getSectionDefinition(
  key: string
): SectionDefinition | undefined {
  return sectionRegistry[key as SectionKey] as SectionDefinition | undefined
}
