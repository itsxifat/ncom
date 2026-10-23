'use client'

import { createContext, useContext } from 'react'
import type { PageRole, SiteKind } from '../sections/storefront'

export interface BuilderPage {
  id: string
  title: string
  slug: string
  isHome: boolean
  role: PageRole
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED'
}

/**
 * The site around the page being edited.
 *
 * The block library needs to know what kind of site this is and which page,
 * so it offers a store's product grid on a store and the order form on a
 * landing page. The link picker needs the site's pages and categories, so a
 * merchant links to "Bags" by choosing it rather than by knowing its address.
 * The page switcher needs the page list itself. All three read it from here.
 */
export interface BuilderSite {
  storeId: string
  storeName: string
  kind: SiteKind
  /** The page open in the builder. */
  pageId: string
  pageRole: PageRole
  pages: BuilderPage[]
  categories: {
    id: string
    name: string
    handle: string
    parentId: string | null
  }[]
  collections: { id: string; title: string; handle: string }[]
  /** The live address, for "View site". */
  liveUrl: string
  /** Whether this installation has the AI builder (Claude) switched on. */
  aiAvailable: boolean
}

const SiteContext = createContext<BuilderSite | null>(null)

export function BuilderSiteProvider({
  site,
  children,
}: {
  site: BuilderSite | null
  children: React.ReactNode
}) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>
}

/** Null only for a builder with no site behind it. */
export function useBuilderSite(): BuilderSite | null {
  return useContext(SiteContext)
}

/** Where a standard page lives on the site. */
export function pagePath(page: Pick<BuilderPage, 'slug' | 'isHome'>): string {
  return page.isHome ? '/' : `/${page.slug}`
}
