import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess, requireHumanOrgAccess } from '@/server/auth/rbac'
import { redis } from '@/server/redis/client'
import type { PageTheme } from '@/modules/sections/types'
import type { PageRole, SiteKind } from '@/generated/prisma/enums'
import { resolveSiteHandle } from './siteHandleService'

const PROJECT_CACHE_TTL_SECONDS = 300

/**
 * ThemeSettings columns that are bookkeeping rather than design. Left out of
 * every copy of a theme — the frozen live one and each version's snapshot — so
 * a copy holds only what paints the page, and a snapshot never nests the
 * previous live theme inside itself.
 */
export const THEME_BOOKKEEPING = {
  id: true,
  storeId: true,
  updatedAt: true,
  liveTheme: true,
} as const
// Versions are immutable (publish always creates a new one), so their
// snapshot cache never goes stale — no explicit invalidation needed.
const SNAPSHOT_CACHE_TTL_SECONDS = 60 * 60 * 24

interface PageSnapshotSection {
  id: string
  order: number
  content: unknown
  config: unknown
  isVisible: boolean
  /** A block key from modules/sections/registry.ts. */
  type: string
  /**
   *
   * Compiling on publish rather than on request means the public render path
   * never executes an untrusted template: a request to a live storefront reads
   * a finished string out of the snapshot. That removes template execution
   * from the hot path entirely — no per-request sandbox cost, no way for a
   * pathological template to slow down or take down page delivery, and the
   * existing snapshot cache keeps working unchanged because the snapshot is
   * still plain JSON.
   */
  html?: string | null
}

export interface PageSnapshot {
  title: string
  seoTitle: string | null
  seoDescription: string | null
  ogImageUrl: string | null
  robotsIndex: boolean
  theme: PageTheme
  sections: PageSnapshotSection[]
}

export async function publishPage(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId, store: { organizationId } },
    include: {
      sections: { orderBy: { order: 'asc' } },
      store: { include: { theme: { omit: THEME_BOOKKEEPING } } },
      ogImage: true,
    },
  })
  if (!page) throw new Error('Page not found')
  if (!page.store.theme) throw new Error('Store theme not found')

  // A snapshot is just the rows: every block is a React component resolved
  // from the in-code registry at render time, so there is nothing to compile
  // and no build step between what the merchant edits and what ships.
  const sections: PageSnapshotSection[] = page.sections.map((section) => ({
    id: section.id,
    order: section.order,
    type: section.type,
    content: section.content,
    config: section.config,
    isVisible: section.isVisible,
  }))

  const snapshot: PageSnapshot = {
    title: page.title,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    ogImageUrl: page.ogImage?.url ?? null,
    robotsIndex: page.robotsIndex,
    theme: page.store.theme,
    sections,
  }

  const version = await prisma.pageVersion.create({
    data: {
      pageId,
      snapshot: snapshot as object,
      createdById: session.user.id,
      publishedAt: new Date(),
    },
  })

  await prisma.page.update({
    where: { id: pageId },
    data: {
      publishedVersionId: version.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })

  return version
}

export async function unpublishPage(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId, store: { organizationId } },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  await prisma.page.update({
    where: { id: pageId },
    data: { status: 'UNPUBLISHED' },
  })
}

export interface CachedStore {
  id: string
  organizationId: string
  name: string
  subdomain: string
  /** Landing or store. */
  kind: SiteKind
  isSearchIndexable: boolean
  /**
   * The store's *current* theme, not the one frozen into a page snapshot.
   *
   * A theme is store-level: it is edited on the theme screen, not on a page,
   * and there is no publish step there to press. Reading it from the snapshot
   * meant a merchant changed their brand colour, saw it everywhere in the
   * builder — which renders the live row — and their published pages kept the
   * old one until each was republished one at a time. That is the "looks right
   * in the editor, wrong on the real link" gap, and it applies to every page a
   * store has at once.
   *
   * Resolved live for the same reason offers are (see offerAdminService): a
   * store-level setting takes effect on the next request. The snapshot keeps
   * its copy as a fallback, so a version published before this still renders.
   */
  theme: PageTheme | null
}

/**
 * The Redis key holding a store's resolved row, so a write can drop it.
 *
 * Versioned with the shape of CachedStore: a row cached by an earlier build
 * lacks fields this one reads — `name` and `subdomain` among them, which made
 * canonical URLs read "undefined.<root>" — so a change to the shape moves to
 * a new key, and the old rows are never read, only left to expire.
 */
function storeCacheKey(subdomain: string): string {
  return `store-by-subdomain:v2:${subdomain}`
}

/**
 * Drops a store's cached row after something on it changes.
 *
 * Called from the theme write. Without it the new brand would take up to
 * `PROJECT_CACHE_TTL_SECONDS` to appear, which is exactly the kind of "it
 * worked when I checked five minutes later" behaviour that makes a merchant
 * think the save failed and press it again.
 */
export async function invalidateStoreCache(subdomain: string): Promise<void> {
  try {
    await redis.del(storeCacheKey(subdomain))
  } catch {
    // Cache is best-effort; the TTL still expires it.
  }
}

/**
 * Takes the route's site handle — a subdomain, or a custom hostname tagged by
 * the proxy — and resolves it to the store behind it.
 */
async function resolveStoreByHandle(
  handle: string
): Promise<CachedStore | null> {
  const subdomain = await resolveSiteHandle(handle)
  if (!subdomain) return null

  const cacheKey = storeCacheKey(subdomain)

  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as CachedStore
  } catch {
    // cache is best-effort
  }

  const row = await prisma.store.findUnique({
    where: { subdomain },
    select: {
      id: true,
      organizationId: true,
      name: true,
      subdomain: true,
      kind: true,
      isSearchIndexable: true,
      theme: true,
    },
  })
  const store: CachedStore | null = row
    ? { ...row, theme: liveThemeOf(row.theme) }
    : null

  if (store) {
    try {
      await redis.set(
        cacheKey,
        JSON.stringify(store),
        'EX',
        PROJECT_CACHE_TTL_SECONDS
      )
    } catch {
      // cache is best-effort
    }
  }

  return store
}

/**
 * The theme a visitor sees: the copy frozen at the last publish, or — for a
 * site never published, which has no live look to keep — the working columns.
 * Every publish path freezes the theme, and sites live before the frozen copy
 * existed were given one from their columns when it arrived.
 */
function liveThemeOf(
  row: (PageTheme & { liveTheme?: unknown }) | null
): PageTheme | null {
  if (!row) return null
  const frozen = row.liveTheme
  if (frozen && typeof frozen === 'object') {
    return { ...row, ...(frozen as Partial<PageTheme>) }
  }
  return row
}

async function getSnapshot(versionId: string): Promise<PageSnapshot | null> {
  const cacheKey = `page-version:${versionId}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as PageSnapshot
  } catch {
    // cache is best-effort
  }

  const version = await prisma.pageVersion.findUnique({
    where: { id: versionId },
    select: { snapshot: true },
  })
  if (!version) return null

  const snapshot = version.snapshot as unknown as PageSnapshot

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(snapshot),
      'EX',
      SNAPSHOT_CACHE_TTL_SECONDS
    )
  } catch {
    // cache is best-effort
  }

  return snapshot
}

/**
 * Resolves a tenant subdomain + path to a published page's snapshot for
 * the public site renderer. The "is this actually published right now"
 * check always hits the database fresh (cheap, indexed) so unpublishing
 * takes effect immediately; only the immutable snapshot blob is cached.
 */
export async function getPublishedPageForRender(
  handle: string,
  path: string[]
) {
  const store = await resolveStoreByHandle(handle)
  if (!store) return null

  const slug = path.join('/')

  // Only standard pages have an address. A store's layout, product page and
  // catalogue page are designs applied to other URLs; reaching one by its slug
  // would show a header with no page under it, or a product page with no
  // product.
  const page = await prisma.page.findFirst({
    where: slug
      ? { storeId: store.id, slug, status: 'PUBLISHED', role: 'STANDARD' }
      : {
          storeId: store.id,
          isHome: true,
          status: 'PUBLISHED',
          role: 'STANDARD',
        },
    select: { id: true, publishedVersionId: true },
  })
  if (!page?.publishedVersionId) return null

  const snapshot = await getSnapshot(page.publishedVersionId)
  if (!snapshot) return null

  // The store's theme now, falling back to the one this version was published
  // with — a page snapshotted before the theme was resolved live still has
  // somewhere to read its colours from.
  const theme = store.theme ?? snapshot.theme

  // Not cached: analytics IDs should take effect on the next request, not
  // wait for a republish, and this is one cheap indexed lookup per render.
  const integration = await prisma.storeIntegrationConfig.findUnique({
    where: { storeId: store.id },
  })

  return { store, page, snapshot, theme, integration }
}

/** For the per-tenant sitemap.xml/robots.txt routes. */
export async function getStoreForSeoRoutes(handle: string) {
  return resolveStoreByHandle(handle)
}

export async function listIndexablePages(storeId: string) {
  return prisma.page.findMany({
    where: {
      storeId,
      status: 'PUBLISHED',
      robotsIndex: true,
      role: 'STANDARD',
    },
    select: { slug: true, isHome: true, updatedAt: true },
  })
}

/**
 * A store's published layout, product page or catalogue page.
 *
 * Null when that page has never been published — the caller falls back to a
 * built-in design rather than failing, so a store published before one of
 * these existed still has working product pages.
 */
export async function getPublishedRolePage(
  storeId: string,
  role: Exclude<PageRole, 'STANDARD'>
): Promise<{ id: string; snapshot: PageSnapshot } | null> {
  const page = await prisma.page.findFirst({
    where: { storeId, role, status: 'PUBLISHED' },
    select: { id: true, publishedVersionId: true },
  })
  if (!page?.publishedVersionId) return null
  const snapshot = await getSnapshot(page.publishedVersionId)
  return snapshot ? { id: page.id, snapshot } : null
}

/** The store behind a site handle, for routes that render more than one page. */
export async function resolvePublicStore(handle: string) {
  return resolveStoreByHandle(handle)
}

/**
 * Makes the site look like the builder.
 *
 * What a merchant means by Publish is "put what I am looking at live", and on
 * an online store what they are looking at is several pages at once: the home
 * page they edited, the header they changed on it, the product page they
 * restyled before that. Publishing one page at a time would leave the rest as
 * invisible drafts that the merchant believes are live. So a store publishes
 * as a whole — every page except the ones the merchant deliberately took
 * offline — and the theme with it.
 *
 * A landing site is one page, so it publishes that page and its theme.
 */
export async function publishSite(
  organizationId: string,
  storeId: string,
  pageId: string
): Promise<{ published: number }> {
  await requireHumanOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true, kind: true, subdomain: true },
  })
  if (!store) throw new Error('Store not found')

  const pageIds =
    store.kind === 'STORE'
      ? (
          await prisma.page.findMany({
            where: {
              storeId,
              // A page taken offline stays offline. Everything else — pages
              // already live and pages never published — goes live together.
              OR: [{ status: { not: 'UNPUBLISHED' } }, { id: pageId }],
            },
            select: { id: true },
          })
        ).map((page) => page.id)
      : [pageId]

  for (const id of pageIds) {
    await publishPage(organizationId, storeId, id)
  }

  await freezeTheme(storeId)
  await invalidateStoreCache(store.subdomain)
  return { published: pageIds.length }
}

/**
 * Publishes one page — the "Publish" in a page's "…" menu — and the theme
 * with it.
 *
 * The theme belongs to the site, not to a page, and it is drafted in the
 * builder alongside the page's words. Publishing only the page would put a
 * Bangla page live inside English checkout labels and Latin digits, because
 * the language is part of the theme, and no number of publishes from this
 * menu would ever change that. So it goes live the way `publishSite` puts it
 * live, minus the other pages of a store, which the menu was not asked about.
 */
export async function publishPageAndTheme(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  await requireHumanOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true, subdomain: true },
  })
  if (!store) throw new Error('Store not found')

  const version = await publishPage(organizationId, store.id, pageId)
  await freezeTheme(store.id)
  await invalidateStoreCache(store.subdomain)
  return version
}

/** Copies the working theme into the live one. */
export async function freezeTheme(storeId: string): Promise<void> {
  const theme = await prisma.themeSettings.findUnique({
    where: { storeId },
    omit: THEME_BOOKKEEPING,
  })
  if (!theme) return
  await prisma.themeSettings.update({
    where: { storeId },
    data: { liveTheme: theme },
  })
}
