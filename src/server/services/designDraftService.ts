import 'server-only'
import { randomBytes } from 'node:crypto'
import { redis } from '@/server/redis/client'
import type { SiteTemplate } from '@/modules/templates/types'
import type { SiteLanguage } from '@/modules/sections/language'
import type { DesignIssue } from '@/modules/sitespec/normalize'

/**
 * A designed site waiting to be created.
 *
 * Between "the AI wrote it" (or "the merchant pasted it") and "create the
 * site", the merchant looks at it: a preview, the list of what was fixed on
 * the way in, a name to pick. The design has to live somewhere for those few
 * minutes, and it is not a site yet — creating one per attempt would fill the
 * workspace with abandoned sites and count each against the plan. So it is
 * held in Redis for a few hours, keyed by an unguessable id and owned by one
 * workspace; nobody else can preview or create from it.
 *
 * Redis is shared by every workspace — rate limits and caches live there too —
 * so what one workspace can park is bounded: a draft no bigger than any real
 * site, and only its newest few kept (enough for a couple of open tabs).
 */

const TTL_SECONDS = 6 * 60 * 60
/**
 * Bytes, not characters — Bangla takes three a letter. Still many times a
 * whole store's design, in either language: the built-in stores are a few
 * kilobytes each, and Claude's longest answer is far under this.
 */
const MAX_DRAFT_BYTES = 1_000_000
const MAX_DRAFTS_PER_WORKSPACE = 5

export interface SiteDraft {
  organizationId: string
  kind: 'LANDING' | 'STORE'
  language: SiteLanguage
  source: 'ai' | 'pasted'
  template: SiteTemplate
  suggestedName: string | null
  issues: DesignIssue[]
  createdAt: string
}

function key(id: string) {
  return `site-draft:${id}`
}

/** The workspace's draft ids, scored by when each was saved. */
function indexKey(organizationId: string) {
  return `site-drafts:${organizationId}`
}

/** A design too big to hold — the merchant reads the message. */
export class SiteDraftTooLargeError extends Error {
  constructor() {
    super(
      'This design is too big to be one website. Ask for fewer pages or sections.'
    )
    this.name = 'SiteDraftTooLargeError'
  }
}

export function isDraftId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
}

export async function saveSiteDraft(
  draft: Omit<SiteDraft, 'createdAt'>
): Promise<string> {
  const value = JSON.stringify({
    ...draft,
    createdAt: new Date().toISOString(),
  })
  if (Buffer.byteLength(value) > MAX_DRAFT_BYTES)
    throw new SiteDraftTooLargeError()

  const id = randomBytes(16).toString('hex')
  const index = indexKey(draft.organizationId)
  const saved = await redis
    .multi()
    .set(key(id), value, 'EX', TTL_SECONDS)
    .zadd(index, Date.now(), id)
    .expire(index, TTL_SECONDS)
    .exec()
  // A transaction reports a failed command in its results rather than by
  // throwing; an id for a draft that was never stored would only fail later.
  const failed = saved?.find(([error]) => error)?.[0]
  if (!saved || failed)
    throw failed ?? new Error('The design could not be saved.')

  // Only the newest few are kept; older ones go now rather than at their
  // expiry. An id already gone (created from, or expired) is deleted again
  // harmlessly.
  const older = await redis.zrange(
    index,
    '0',
    String(-(MAX_DRAFTS_PER_WORKSPACE + 1))
  )
  if (older.length > 0) {
    await redis
      .multi()
      .del(...older.map(key))
      .zrem(index, ...older)
      .exec()
  }
  return id
}

/** The draft, if it exists and belongs to this workspace. */
export async function loadSiteDraft(
  organizationId: string,
  id: string
): Promise<SiteDraft | null> {
  if (!isDraftId(id)) return null
  const raw = await redis.get(key(id))
  if (!raw) return null
  try {
    const draft = JSON.parse(raw) as SiteDraft
    return draft.organizationId === organizationId ? draft : null
  } catch {
    return null
  }
}

export async function discardSiteDraft(id: string): Promise<void> {
  if (!isDraftId(id)) return
  await redis.del(key(id)).catch(() => undefined)
}
