import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import type { PageSnapshot } from './publishService'

/**
 * A page's published versions, for the builder's History panel.
 *
 * Every publish writes a `PageVersion` holding the page exactly as it went
 * live (see `publishPage`), so the history of what visitors saw already
 * exists; this only reads it back. Bringing a version back is not done here:
 * the builder lays the version's blocks over its draft as one undoable edit,
 * and the draft is saved the way every edit is — through the save that checks
 * nobody else changed the page meanwhile.
 */

/** How many versions the panel lists. Older ones stay in the table. */
const MAX_LISTED = 30

/**
 * How many rows are read to find them. A store's publish writes a version of
 * every page, changed or not, so the versions of a page nobody touched are
 * mostly the same version again and again; they are folded into one entry,
 * and reading past them is what finds the versions that differ.
 */
const MAX_SCANNED = 300

export interface PageVersionSummary {
  id: string
  label: string | null
  /** When this version went live — the newest of the publishes folded into it. */
  publishedAt: string
  /** Who published it: their name, or their email when they have no name. */
  publishedBy: string | null
  /** How many publishes in a row put exactly these blocks live. */
  publishCount: number
  sectionCount: number
  /** Whether visitors see this version now. */
  live: boolean
}

export interface PageVersionSection {
  id: string
  type: string
  order: number
  content: Record<string, unknown>
  config: Record<string, unknown>
  isVisible: boolean
}

interface VersionRow {
  id: string
  label: string | null
  createdAt: Date
  publishedAt: Date | null
  sectionsHash: string | null
  sectionCount: number | null
  userName: string | null
  userEmail: string | null
}

/**
 * The versions of a page, newest first, with runs of identical ones folded
 * together.
 *
 * Identical is judged on the blocks alone — the only part of a version the
 * builder brings back — by hashing them in the database, so a page whose
 * versions each carry a 90KB custom-code design is compared without reading
 * any of it. Postgres stores JSON normalised, so the same blocks always hash
 * the same.
 */
export async function listPageVersions(
  organizationId: string,
  storeId: string,
  pageId: string
): Promise<PageVersionSummary[]> {
  await requireOrgAccess(organizationId, 'VIEWER')
  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId, store: { organizationId } },
    select: { id: true, status: true, publishedVersionId: true },
  })
  if (!page) throw new Error('Page not found')

  const rows = await prisma.$queryRaw<VersionRow[]>`
    SELECT v.id,
           v.label,
           v."createdAt",
           v."publishedAt",
           md5((v.snapshot -> 'sections')::text) AS "sectionsHash",
           CASE WHEN jsonb_typeof(v.snapshot -> 'sections') = 'array'
                THEN jsonb_array_length(v.snapshot -> 'sections')
                ELSE 0 END::int AS "sectionCount",
           u.name AS "userName",
           u.email AS "userEmail"
    FROM "PageVersion" v
    LEFT JOIN "User" u ON u.id = v."createdById"
    WHERE v."pageId" = ${page.id}
    ORDER BY v."createdAt" DESC
    LIMIT ${MAX_SCANNED}
  `

  // Visitors see the published version only while the page is published; a
  // page taken offline keeps pointing at what it last showed.
  const liveId = page.status === 'PUBLISHED' ? page.publishedVersionId : null

  const versions: PageVersionSummary[] = []
  let previousHash: string | null = null
  for (const row of rows) {
    const current = versions[versions.length - 1]
    if (
      current &&
      row.sectionsHash !== null &&
      row.sectionsHash === previousHash
    ) {
      // An older publish of the same blocks: one more time this version went
      // live, not a version of its own.
      current.publishCount += 1
      if (row.id === liveId) current.live = true
      continue
    }
    if (versions.length === MAX_LISTED) break
    previousHash = row.sectionsHash
    versions.push({
      id: row.id,
      label: row.label,
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      publishedBy: row.userName?.trim() || row.userEmail || null,
      publishCount: 1,
      sectionCount: row.sectionCount ?? 0,
      live: row.id === liveId,
    })
  }
  return versions
}

/** One version's blocks, as the builder holds a page's own blocks. */
export async function getPageVersionSections(
  organizationId: string,
  storeId: string,
  pageId: string,
  versionId: string
): Promise<PageVersionSection[]> {
  await requireOrgAccess(organizationId, 'VIEWER')
  const version = await prisma.pageVersion.findFirst({
    where: {
      id: versionId,
      pageId,
      page: { storeId, store: { organizationId } },
    },
    select: { snapshot: true },
  })
  if (!version) throw new Error('That version no longer exists.')

  const snapshot = version.snapshot as unknown as Partial<PageSnapshot> | null
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : []
  return sections
    .filter(
      (section) =>
        section &&
        typeof section.id === 'string' &&
        typeof section.type === 'string'
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section, order) => ({
      id: section.id,
      type: section.type,
      order,
      content: asRecord(section.content),
      config: asRecord(section.config),
      isVisible: section.isVisible !== false,
    }))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
