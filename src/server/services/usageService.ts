import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { redis } from '@/server/redis/client'
import type { UsageMetric } from '@/generated/prisma/enums'
import { CURRENT_PERIOD, usagePeriodKey } from '@/lib/plans'

/**
 * What an organisation has actually consumed.
 *
 * Two kinds of number live here and they are measured differently:
 *
 *   Stock  — how many pages/sites/domains/seats/bytes exist right now. Counted
 *            live from the owning tables, so it is always right and can never
 *            drift from reality. Deleting a page frees the quota immediately.
 *
 *   Flow   — traffic and visitors accumulated this month. Cannot be counted
 *            live (there is no row per byte), so it is incremented into
 *            UsageCounter and keyed by UTC month.
 *
 * Mixing the two up is the classic metering bug: a stored counter for pages
 * gets out of step with the table the moment any code path deletes a row
 * without decrementing, and every tenant then sees a quota they cannot free.
 */

export interface UsageSnapshot {
  pages: number
  stores: number
  customDomains: number
  /** Accepted members plus outstanding invitations — see `countTeamSeats`. */
  teamMembers: number
  storageBytes: number
  monthlyTrafficBytes: number
  monthlyVisitors: number
  monthlyPageViews: number
  aiGenerations: number
  /** The UTC month the flow figures above cover, e.g. "2026-08". */
  period: string
}

// ── Stock metrics: counted live ───────────────────────────────────────────

export function countPages(organizationId: string): Promise<number> {
  return prisma.page.count({ where: { store: { organizationId } } })
}

export function countStores(organizationId: string): Promise<number> {
  return prisma.store.count({ where: { organizationId } })
}

export function countCustomDomains(organizationId: string): Promise<number> {
  return prisma.customDomain.count({ where: { organizationId } })
}

/**
 * Seats in use = accepted members + pending invitations.
 *
 * Invitations count because they are a promise of a seat. Counting only
 * memberships lets a 1-seat organisation send five invitations and end up with
 * five members, since each acceptance individually looked like it fit.
 */
export async function countTeamSeats(
  organizationId: string,
  /**
   * One invitation to leave out of the count.
   *
   * Passed when checking whether that invitation can be accepted. A pending
   * invitation is already holding a seat, and accepting it converts that seat
   * into a membership rather than claiming a second one — so counting it and
   * *then* asking for one more charges the same person twice. That made the
   * last seat of every plan unusable: the invitation sent fine, and the
   * recipient could never accept it.
   */
  excludeInvitationId?: string
): Promise<number> {
  const [members, pendingInvites] = await Promise.all([
    prisma.membership.count({ where: { organizationId } }),
    prisma.orgInvitation.count({
      where: {
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}),
      },
    }),
  ])
  return members + pendingInvites
}

export async function sumStorageBytes(organizationId: string): Promise<number> {
  const result = await prisma.mediaAsset.aggregate({
    where: { organizationId },
    _sum: { sizeBytes: true },
  })
  return result._sum.sizeBytes ?? 0
}

// ── Flow metrics: counters ────────────────────────────────────────────────

/**
 * Reads one counter. Missing rows read as 0 rather than being created, so a
 * quota check never writes.
 *
 * BigInt is converted to Number here, at the boundary, because BigInt is not
 * JSON-serialisable and would throw the moment it reached a client component.
 * Byte counts stay exact well past a petabyte in a double, so nothing is lost.
 */
export async function readCounter(
  organizationId: string,
  metric: UsageMetric,
  period: string
): Promise<number> {
  const row = await prisma.usageCounter.findUnique({
    where: {
      organizationId_metric_period: { organizationId, metric, period },
    },
    select: { value: true },
  })
  return row ? Number(row.value) : 0
}

/**
 * Adds to a counter, creating it on first use.
 *
 * A single upsert rather than read-then-write: page renders are concurrent, and
 * two requests reading 100 and both writing 101 would lose a byte count. The
 * `increment` runs inside the database.
 */
export async function incrementCounter(
  organizationId: string,
  metric: UsageMetric,
  delta: number,
  period = usagePeriodKey()
): Promise<void> {
  if (delta <= 0) return

  await prisma.usageCounter.upsert({
    where: {
      organizationId_metric_period: { organizationId, metric, period },
    },
    create: {
      organizationId,
      metric,
      period,
      value: BigInt(Math.round(delta)),
    },
    update: { value: { increment: BigInt(Math.round(delta)) } },
  })
}

/**
 * Records bytes served for a tenant.
 *
 * Called from the public renderer on every response, so it must never make the
 * request fail: a metering outage should cost accuracy, not availability. Same
 * fail-open reasoning as the rate limiter.
 */
export async function recordTraffic(
  organizationId: string,
  bytes: number
): Promise<void> {
  try {
    await incrementCounter(organizationId, 'TRAFFIC_BYTES', bytes)
  } catch (error) {
    console.error('Failed to record traffic usage:', error)
  }
}

/**
 * Records a page view, and a visitor if this hash has not been seen this month.
 *
 * Distinctness is decided in Redis rather than by a `COUNT(DISTINCT ...)` over
 * PageView: that query grows with traffic and would run on the hot render path
 * for every request. A Redis set per org-month answers "is this hash new?" in
 * one round trip, and the expiry means old months clean themselves up.
 *
 * If Redis is down the visitor is counted anyway. Over-counting a visitor is a
 * cosmetic inaccuracy; dropping the view entirely would under-bill silently.
 */
export async function recordVisit(
  organizationId: string,
  visitorHash: string
): Promise<void> {
  const period = usagePeriodKey()

  try {
    await incrementCounter(organizationId, 'PAGE_VIEWS', 1, period)

    let isNewVisitor = true
    try {
      const key = `usage:visitors:${organizationId}:${period}`
      // 1 = the member was added, i.e. not seen before this month.
      isNewVisitor = (await redis.sadd(key, visitorHash)) === 1
      // Two months of slack: long enough that a late request for last month
      // still dedupes, short enough that the set does not live forever.
      await redis.expire(key, 62 * 24 * 60 * 60)
    } catch (error) {
      console.error('Visitor dedupe unavailable, counting as new:', error)
    }

    if (isNewVisitor) {
      await incrementCounter(organizationId, 'VISITORS', 1, period)
    }
  } catch (error) {
    console.error('Failed to record visit:', error)
  }
}

/**
 * A visitor identifier that is stable for one calendar month.
 *
 * Deliberately not `analyticsService`'s hash, which rotates daily so a visitor
 * cannot be correlated across days. That is the right call for analytics, but it
 * makes a monthly unique count impossible — the same person would be counted
 * every day they returned, and "monthly visitors" would really mean "sum of
 * daily visitors", inflating usage against a plan limit.
 *
 * Rotating monthly keeps the privacy property that matters (no raw IP or
 * user-agent is stored anywhere, and the identifier is useless next month) while
 * making the metric mean what the price sheet says.
 */
export function monthlyVisitorHash(ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${ip}:${userAgent}:${usagePeriodKey()}`)
    .digest('hex')
}

/**
 * Rough size of an HTML response, for traffic metering.
 *
 * An estimate, and labelled as one. The real byte count is known only to the
 * layer that flushes the response, which a server component cannot see. Summing
 * the snapshot's compiled markup plus a fixed allowance for the document shell
 * tracks page weight closely enough to bill a 100GB allowance against, and it is
 * consistent from request to request — which matters more here than absolute
 * precision.
 *
 * Media is excluded: images are served from the CDN, never through this app, so
 * counting them here would bill a tenant for bytes we did not send.
 */
export function estimateHtmlBytes(
  sections: { html?: string | null }[]
): number {
  const DOCUMENT_SHELL_BYTES = 24 * 1024

  const markup = sections.reduce(
    (total, section) => total + (section.html?.length ?? 0),
    0
  )
  // UTF-8: Latin text is one byte per character, so length is a fair floor.
  return DOCUMENT_SHELL_BYTES + markup
}

export async function recordAiGeneration(
  organizationId: string,
  count = 1
): Promise<void> {
  await incrementCounter(organizationId, 'AI_GENERATIONS', count)
}

// ── Snapshot ──────────────────────────────────────────────────────────────

export async function getUsageSnapshot(
  organizationId: string
): Promise<UsageSnapshot> {
  const period = usagePeriodKey()

  const [
    pages,
    stores,
    customDomains,
    teamMembers,
    storageBytes,
    monthlyTrafficBytes,
    monthlyVisitors,
    monthlyPageViews,
    aiGenerations,
  ] = await Promise.all([
    countPages(organizationId),
    countStores(organizationId),
    countCustomDomains(organizationId),
    countTeamSeats(organizationId),
    sumStorageBytes(organizationId),
    readCounter(organizationId, 'TRAFFIC_BYTES', period),
    readCounter(organizationId, 'VISITORS', period),
    readCounter(organizationId, 'PAGE_VIEWS', period),
    readCounter(organizationId, 'AI_GENERATIONS', period),
  ])

  return {
    pages,
    stores,
    customDomains,
    teamMembers,
    storageBytes,
    monthlyTrafficBytes,
    monthlyVisitors,
    monthlyPageViews,
    aiGenerations,
    period,
  }
}

/**
 * Storage totals for every organisation in one query, for the admin usage tab.
 *
 * A per-org `sumStorageBytes` in a loop is one query per tenant; this is one
 * groupBy for the whole platform.
 */
export async function getStorageByOrganization(): Promise<Map<string, number>> {
  const rows = await prisma.mediaAsset.groupBy({
    by: ['organizationId'],
    _sum: { sizeBytes: true },
  })
  return new Map(
    rows.map((row) => [row.organizationId, row._sum.sizeBytes ?? 0])
  )
}

/** This month's counters for every organisation, keyed `orgId:metric`. */
export async function getMonthlyCountersByOrganization(
  period = usagePeriodKey()
): Promise<Map<string, number>> {
  const rows = await prisma.usageCounter.findMany({
    where: { period },
    select: { organizationId: true, metric: true, value: true },
  })
  return new Map(
    rows.map((row) => [
      `${row.organizationId}:${row.metric}`,
      Number(row.value),
    ])
  )
}

/**
 * Wipes an organisation's counters for the current month.
 *
 * Support tool, exposed in the admin usage tab: a tenant throttled by a
 * mis-metered spike needs their month reset without waiting for the calendar.
 * Stock metrics are not resettable — they are counted from real rows.
 */
export async function resetMonthlyUsage(
  organizationId: string,
  period = usagePeriodKey()
): Promise<void> {
  await prisma.usageCounter.deleteMany({
    where: {
      organizationId,
      period,
      metric: {
        in: ['TRAFFIC_BYTES', 'VISITORS', 'PAGE_VIEWS', 'AI_GENERATIONS'],
      },
    },
  })

  try {
    await redis.del(`usage:visitors:${organizationId}:${period}`)
  } catch (error) {
    console.error('Failed to clear visitor dedupe set:', error)
  }
}

/** Kept for symmetry with the stock metrics: storage has no counter to reset. */
export const STOCK_METRICS_ARE_COUNTED_LIVE = true

export { CURRENT_PERIOD, usagePeriodKey }
