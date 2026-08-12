import 'server-only'
import { prisma } from '@/server/db/client'
import { redis } from '@/server/redis/client'
import {
  QUOTA_META,
  formatQuota,
  formatUsage,
  quotaFraction,
  usagePeriodKey,
  type QuotaKey,
} from '@/lib/plans'
import {
  getEntitlements,
  usedForQuota,
} from '@/server/services/entitlementService'
import { getUsageSnapshot } from '@/server/services/usageService'
import { sendEmail } from '@/server/services/emailService'
import { usageWarningEmail } from '@/server/email/templates'

/**
 * Warns tenants before a quota stops them.
 *
 * Deliberately a sweep rather than a check on the metering hot path. Traffic is
 * recorded on every page view, and resolving entitlements there to compare
 * against a limit would add a subscription read to every request on every public
 * site — the exact place this platform can least afford one. A periodic pass over
 * organisations costs a handful of queries per run instead.
 *
 * Called by `/api/cron/usage-alerts`; point any scheduler at that route.
 */

/**
 * Only quotas where advance warning is actionable.
 *
 * Page and site counts are excluded on purpose: hitting those produces an
 * immediate, self-explanatory refusal in the UI at the moment the tenant tries to
 * create one. An email saying "you have used 4 of 5 pages" is noise.
 */
const ALERTED_QUOTAS: QuotaKey[] = [
  'STORAGE_BYTES',
  'MONTHLY_TRAFFIC_BYTES',
  'MONTHLY_VISITORS',
]

/** Warn once crossing 80%, then again at 100%. */
const THRESHOLDS = [80, 100] as const

export interface UsageAlertRun {
  organizationsChecked: number
  alertsSent: number
  alertsSkipped: number
  failures: number
}

/**
 * Whether this (org, quota, threshold, period) has already been emailed.
 *
 * The latch lives in Redis rather than a table: it is per-month state that
 * expires on its own, and a missed alert is a far smaller problem than a nightly
 * email repeating the same warning for the rest of the month. If Redis is
 * unavailable this returns false — meaning the alert is treated as already sent,
 * so an outage causes silence rather than a flood.
 */
async function claimAlert(
  organizationId: string,
  quota: QuotaKey,
  threshold: number,
  period: string
): Promise<boolean> {
  const key = `usage:alert:${organizationId}:${quota}:${threshold}:${period}`
  try {
    // NX + expiry: the first caller sets it, everyone after gets null. Two
    // overlapping cron runs therefore cannot both send.
    const claimed = await redis.set(key, '1', 'EX', 40 * 24 * 60 * 60, 'NX')
    return claimed === 'OK'
  } catch (error) {
    console.error(
      'Usage alert latch unavailable, skipping to avoid repeats:',
      error
    )
    return false
  }
}

async function ownerEmailFor(organizationId: string): Promise<string | null> {
  const owner = await prisma.membership.findFirst({
    where: { organizationId, role: 'OWNER' },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return owner?.user.email ?? null
}

export async function runUsageAlerts(): Promise<UsageAlertRun> {
  const period = usagePeriodKey()
  const result: UsageAlertRun = {
    organizationsChecked: 0,
    alertsSent: 0,
    alertsSkipped: 0,
    failures: 0,
  }

  // Only organisations with a subscription: one without is on nothing and has no
  // limits to warn about.
  const organizations = await prisma.organization.findMany({
    where: { subscription: { isNot: null } },
    select: { id: true, name: true },
  })

  for (const organization of organizations) {
    result.organizationsChecked++

    try {
      const entitlements = await getEntitlements(organization.id)
      if (entitlements.quotaEnforcementDisabled) continue

      const usage = await getUsageSnapshot(organization.id)

      for (const quota of ALERTED_QUOTAS) {
        const limit = entitlements.quotas[quota]
        // Unlimited quotas have nothing to approach. A visitor limit that the
        // plan does not enforce is advisory, so warning about it would be
        // threatening a consequence that never arrives.
        if (limit === null) continue
        if (quota === 'MONTHLY_VISITORS' && !entitlements.enforceVisitorCap)
          continue
        if (
          quota === 'MONTHLY_TRAFFIC_BYTES' &&
          !entitlements.enforceTrafficCap
        ) {
          continue
        }

        const used = usedForQuota(quota, usage)
        const percent = Math.floor(quotaFraction(limit, used) * 100)

        // Highest threshold first, so crossing straight past 80 to 100 sends the
        // urgent message rather than the advisory one.
        const crossed = [...THRESHOLDS].reverse().find((t) => percent >= t)
        if (crossed === undefined) continue

        if (!(await claimAlert(organization.id, quota, crossed, period))) {
          result.alertsSkipped++
          continue
        }

        const email = await ownerEmailFor(organization.id)
        if (!email) {
          result.alertsSkipped++
          continue
        }

        const meta = QUOTA_META[quota]
        const rendered = usageWarningEmail({
          workspaceName: organization.name,
          quotaLabel: meta.label,
          usedLabel: formatUsage(used, meta.unit),
          limitLabel: formatQuota(limit, meta.unit),
          percent,
        })

        const sent = await sendEmail({
          purpose: 'USAGE_ALERT',
          to: email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })

        if (sent.status === 'SENT') result.alertsSent++
        else result.alertsSkipped++
      }
    } catch (error) {
      // One tenant's failure must not end the sweep for everyone after them.
      result.failures++
      console.error(`Usage alert failed for ${organization.id}:`, error)
    }
  }

  return result
}
