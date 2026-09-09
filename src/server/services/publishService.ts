import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess, requireHumanOrgAccess } from '@/server/auth/rbac'
import { redis } from '@/server/redis/client'
import type { PageTheme } from '@/modules/sections/types'
import { resolveSiteHandle } from './siteHandleService'

const PROJECT_CACHE_TTL_SECONDS = 300
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
      store: { include: { theme: true } },
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

interface CachedStore {
  id: string
  organizationId: string
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

/** The Redis key holding a store's resolved row, so a write can drop it. */
function storeCacheKey(subdomain: string): string {
  return `store-by-subdomain:${subdomain}`
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
      isSearchIndexable: true,
      theme: true,
    },
  })
  const store: CachedStore | null = row
    ? { ...row, theme: (row.theme as PageTheme | null) ?? null }
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

  const page = await prisma.page.findFirst({
    where: slug
      ? { storeId: store.id, slug, status: 'PUBLISHED' }
      : { storeId: store.id, isHome: true, status: 'PUBLISHED' },
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
    },
    select: { slug: true, isHome: true, updatedAt: true },
  })
}
