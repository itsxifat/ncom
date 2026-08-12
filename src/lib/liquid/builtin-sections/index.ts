import { PRODUCT_SHOWCASE_SOURCE } from './product-showcase'
import { PRODUCT_HERO_SOURCE } from './product-hero'
import { BUNDLE_OFFER_SOURCE } from './bundle-offer'
import {
  COUNTDOWN_SOURCE,
  DELIVERY_INFO_SOURCE,
  GUARANTEE_SOURCE,
  STEPS_SOURCE,
  TRUST_BADGES_SOURCE,
} from './conversion'
import {
  ANNOUNCEMENT_SOURCE,
  COMPARISON_SOURCE,
  GALLERY_STRIP_SOURCE,
  MARQUEE_SOURCE,
  REVIEWS_SOURCE,
  STICKY_BAR_SOURCE,
} from './social'

/**
 * The commerce section library, seeded as global ComponentDefinitions.
 *
 * These are Liquid rather than React because only Liquid sections receive the
 * store's catalogue — see builtin-sections/shared.ts for why that matters. The
 * seed reads this list and upserts one definition per entry, compiling each
 * `{% schema %}` into the Inspector fields the builder renders, so adding a
 * section here is the whole job: no registry edit, no PageRenderer change.
 *
 * `key` is the stable identity. Changing one orphans every page already using
 * it, so treat these as permanent once shipped.
 */
export interface BuiltinLiquidSection {
  key: string
  /** Fallback name; the schema's own `name` wins when present. */
  name: string
  category: string
  source: string
}

export const BUILTIN_LIQUID_SECTIONS: BuiltinLiquidSection[] = [
  {
    key: 'product-showcase',
    name: 'Product showcase',
    category: 'Commerce',
    source: PRODUCT_SHOWCASE_SOURCE,
  },
  {
    key: 'product-hero',
    name: 'Product hero',
    category: 'Commerce',
    source: PRODUCT_HERO_SOURCE,
  },
  {
    key: 'bundle-offer',
    name: 'Bundle offer',
    category: 'Commerce',
    source: BUNDLE_OFFER_SOURCE,
  },
  {
    key: 'countdown',
    name: 'Countdown',
    category: 'Commerce',
    source: COUNTDOWN_SOURCE,
  },
  {
    key: 'trust-badges',
    name: 'Trust badges',
    category: 'Commerce',
    source: TRUST_BADGES_SOURCE,
  },
  {
    key: 'order-steps',
    name: 'How to order',
    category: 'Commerce',
    source: STEPS_SOURCE,
  },
  {
    key: 'guarantee',
    name: 'Guarantee',
    category: 'Commerce',
    source: GUARANTEE_SOURCE,
  },
  {
    key: 'delivery-info',
    name: 'Delivery charges',
    category: 'Commerce',
    source: DELIVERY_INFO_SOURCE,
  },
  {
    key: 'reviews',
    name: 'Customer reviews',
    category: 'Commerce',
    source: REVIEWS_SOURCE,
  },
  {
    key: 'comparison',
    name: 'Comparison table',
    category: 'Commerce',
    source: COMPARISON_SOURCE,
  },
  {
    key: 'marquee',
    name: 'Scrolling banner',
    category: 'Commerce',
    source: MARQUEE_SOURCE,
  },
  {
    key: 'announcement',
    name: 'Announcement bar',
    category: 'Commerce',
    source: ANNOUNCEMENT_SOURCE,
  },
  {
    key: 'sticky-order-bar',
    name: 'Sticky order bar',
    category: 'Commerce',
    source: STICKY_BAR_SOURCE,
  },
  {
    key: 'gallery-strip',
    name: 'Image gallery',
    category: 'Commerce',
    source: GALLERY_STRIP_SOURCE,
  },
]
