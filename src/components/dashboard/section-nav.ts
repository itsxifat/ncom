import type { SectionTab } from '@/components/app/section-tabs'

/**
 * The tab rows for the sections that gather several screens under one rail
 * entry. Plain data so the server pages that render them can share one
 * definition; `SectionTabs` works out which tab is current.
 */

/** Products: everything about what a workspace sells. */
export const CATALOG_TABS: SectionTab[] = [
  { href: '/products', label: 'All products' },
  { href: '/categories', label: 'Categories' },
  { href: '/collections', label: 'Collections' },
  { href: '/inventory', label: 'Stock' },
]

/** Websites: online stores and landing pages, and the images on them. */
export const PAGES_TABS: SectionTab[] = [
  { href: '/stores', label: 'Websites' },
  { href: '/media', label: 'Images' },
]
