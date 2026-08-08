import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { redis } from '@/server/redis/client'
import type { PageTheme } from '@/modules/sections/types'

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
  componentDefinition: { key: string }
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
  projectId: string,
  pageId: string
) {
  const { session } = await requireOrgAccess(organizationId, 'EDITOR')

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId, project: { organizationId } },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { componentDefinition: true },
      },
      project: { include: { theme: true } },
      ogImage: true,
    },
  })
  if (!page) throw new Error('Page not found')
  if (!page.project.theme) throw new Error('Project theme not found')

  const snapshot: PageSnapshot = {
    title: page.title,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    ogImageUrl: page.ogImage?.url ?? null,
    robotsIndex: page.robotsIndex,
    theme: page.project.theme,
    sections: page.sections.map((section) => ({
      id: section.id,
      order: section.order,
      content: section.content,
      config: section.config,
      isVisible: section.isVisible,
      componentDefinition: { key: section.componentDefinition.key },
    })),
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
  projectId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId, project: { organizationId } },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  await prisma.page.update({
    where: { id: pageId },
    data: { status: 'UNPUBLISHED' },
  })
}

interface CachedProject {
  id: string
  organizationId: string
  isSearchIndexable: boolean
}

async function resolveProjectBySubdomain(
  subdomain: string
): Promise<CachedProject | null> {
  const cacheKey = `project-by-subdomain:${subdomain}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as CachedProject
  } catch {
    // cache is best-effort
  }

  const project = await prisma.project.findUnique({
    where: { subdomain },
    select: { id: true, organizationId: true, isSearchIndexable: true },
  })

  if (project) {
    try {
      await redis.set(
        cacheKey,
        JSON.stringify(project),
        'EX',
        PROJECT_CACHE_TTL_SECONDS
      )
    } catch {
      // cache is best-effort
    }
  }

  return project
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
  subdomain: string,
  path: string[]
) {
  const project = await resolveProjectBySubdomain(subdomain)
  if (!project) return null

  const slug = path.join('/')

  const page = await prisma.page.findFirst({
    where: slug
      ? { projectId: project.id, slug, status: 'PUBLISHED' }
      : { projectId: project.id, isHome: true, status: 'PUBLISHED' },
    select: { id: true, publishedVersionId: true },
  })
  if (!page?.publishedVersionId) return null

  const snapshot = await getSnapshot(page.publishedVersionId)
  if (!snapshot) return null

  // Not cached: analytics IDs should take effect on the next request, not
  // wait for a republish, and this is one cheap indexed lookup per render.
  const integration = await prisma.projectIntegrationConfig.findUnique({
    where: { projectId: project.id },
  })

  return { project, page, snapshot, integration }
}

/** For the per-tenant sitemap.xml/robots.txt routes. */
export async function getProjectForSeoRoutes(subdomain: string) {
  return resolveProjectBySubdomain(subdomain)
}

export async function listIndexablePages(projectId: string) {
  return prisma.page.findMany({
    where: {
      projectId,
      status: 'PUBLISHED',
      robotsIndex: true,
    },
    select: { slug: true, isHome: true, updatedAt: true },
  })
}
