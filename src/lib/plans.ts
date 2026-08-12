/**
 * The vocabulary of the subscription model, shared by the server that enforces
 * it and the UI that explains it.
 *
 * Client-safe on purpose: the billing page, the pricing table, the admin plan
 * editor and the quota errors all have to name the same things, and a label
 * that lives on the server would be re-typed (and drift) in every one of them.
 * Nothing here reads the database or knows about a session — that is
 * entitlementService's job.
 *
 * Quotas are `number | null`, where null means unlimited. Zero means none
 * allowed. Every consumer must handle both, so the comparison lives in
 * `isWithinQuota` rather than being re-derived at each call site: a plain
 * `used < limit` silently denies everything on an unlimited plan, because
 * `1 < null` is false.
 */

import type { FeatureAvailability, SupportTier } from '@/generated/prisma/enums'

export const PLATFORM_CURRENCY = 'BDT'

// ── Quotas ────────────────────────────────────────────────────────────────

export const QUOTA_KEYS = [
  'PAGES',
  'STORES',
  'CUSTOM_DOMAINS',
  'TEAM_MEMBERS',
  'STORAGE_BYTES',
  'MONTHLY_TRAFFIC_BYTES',
  'MONTHLY_VISITORS',
] as const

export type QuotaKey = (typeof QUOTA_KEYS)[number]

export type QuotaUnit = 'count' | 'bytes'

interface QuotaMeta {
  label: string
  /** Shown when the quota is hit, so the message says what to do next. */
  exceededHint: string
  unit: QuotaUnit
  /** Monthly quotas reset; stock quotas reflect what currently exists. */
  resets: boolean
}

export const QUOTA_META: Record<QuotaKey, QuotaMeta> = {
  PAGES: {
    label: 'Landing pages',
    exceededHint: 'Delete a page or upgrade for more.',
    unit: 'count',
    resets: false,
  },
  STORES: {
    label: 'Sites',
    exceededHint: 'Delete a site or upgrade for more.',
    unit: 'count',
    resets: false,
  },
  CUSTOM_DOMAINS: {
    label: 'Custom domains',
    exceededHint: 'Remove a domain, buy the extra-domain add-on, or upgrade.',
    unit: 'count',
    resets: false,
  },
  TEAM_MEMBERS: {
    label: 'Team members',
    exceededHint: 'Remove a member, buy a seat add-on, or upgrade.',
    unit: 'count',
    resets: false,
  },
  STORAGE_BYTES: {
    label: 'Media storage',
    exceededHint: 'Delete unused media, buy extra storage, or upgrade.',
    unit: 'bytes',
    resets: false,
  },
  MONTHLY_TRAFFIC_BYTES: {
    label: 'Monthly traffic',
    exceededHint: 'Buy extra traffic or upgrade — it resets next month.',
    unit: 'bytes',
    resets: true,
  },
  MONTHLY_VISITORS: {
    label: 'Monthly visitors',
    exceededHint: 'Upgrade for more headroom — it resets next month.',
    unit: 'count',
    resets: true,
  },
}

/** Quota limits, resolved for one organisation. null = unlimited. */
export type Quotas = Record<QuotaKey, number | null>

export function isUnlimited(limit: number | null): boolean {
  return limit === null
}

/**
 * Whether `used + wanted` still fits under `limit`.
 *
 * The null check is the whole point of this function existing — see the file
 * header. `wanted` defaults to 1 because almost every caller is about to create
 * exactly one thing.
 */
export function isWithinQuota(
  limit: number | null,
  used: number,
  wanted = 1
): boolean {
  if (limit === null) return true
  return used + wanted <= limit
}

export function remainingQuota(
  limit: number | null,
  used: number
): number | null {
  if (limit === null) return null
  return Math.max(0, limit - used)
}

/** Fraction of a quota consumed, 0–1. Unlimited quotas are never "full". */
export function quotaFraction(limit: number | null, used: number): number {
  if (limit === null || limit <= 0) return 0
  return Math.min(1, used / limit)
}

// ── Features ──────────────────────────────────────────────────────────────

export const FEATURE_KEYS = [
  'PREMIUM_TEMPLATES',
  'ADVANCED_SEO',
  'GOOGLE_ANALYTICS',
  'META_PIXEL',
  'GOOGLE_TAG_MANAGER',
  'AI_CONTENT_ASSISTANT',
  'ADVANCED_ANALYTICS',
  'WHITE_LABEL',
  'DEDICATED_ACCOUNT_MANAGER',
  'DEDICATED_TECHNICAL_SUPPORT',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

/**
 * Maps a feature key to the `Plan` column that carries its availability.
 *
 * One table instead of a switch in every consumer: the admin editor, the
 * pricing table and the entitlement resolver all need to walk plan columns
 * generically, and a missing case in any of them would silently read as
 * "unavailable".
 */
export const FEATURE_PLAN_COLUMN = {
  PREMIUM_TEMPLATES: 'premiumTemplates',
  ADVANCED_SEO: 'advancedSeo',
  GOOGLE_ANALYTICS: 'googleAnalytics',
  META_PIXEL: 'metaPixel',
  GOOGLE_TAG_MANAGER: 'googleTagManager',
  AI_CONTENT_ASSISTANT: 'aiContentAssistant',
  ADVANCED_ANALYTICS: 'advancedAnalytics',
  WHITE_LABEL: 'whiteLabel',
  DEDICATED_ACCOUNT_MANAGER: 'dedicatedAccountManager',
  DEDICATED_TECHNICAL_SUPPORT: 'dedicatedTechnicalSupport',
} as const satisfies Record<FeatureKey, string>

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  PREMIUM_TEMPLATES: 'Premium templates',
  ADVANCED_SEO: 'Advanced SEO',
  GOOGLE_ANALYTICS: 'Google Analytics',
  META_PIXEL: 'Meta Pixel',
  GOOGLE_TAG_MANAGER: 'Google Tag Manager',
  AI_CONTENT_ASSISTANT: 'AI content assistant',
  ADVANCED_ANALYTICS: 'Advanced analytics',
  WHITE_LABEL: 'White label / custom branding',
  DEDICATED_ACCOUNT_MANAGER: 'Dedicated account manager',
  DEDICATED_TECHNICAL_SUPPORT: 'Dedicated technical support',
}

/** Feature flags that are on for every tier today, kept for the pricing table. */
export const BASELINE_FEATURE_LABELS = {
  ncomSubdomain: 'NCOM subdomain',
  dragDropBuilder: 'Drag & drop builder',
  responsiveEditor: 'Responsive editor',
  basicTemplates: 'Basic templates',
  basicSeo: 'Basic SEO',
  sslCertificate: 'SSL certificate',
} as const

/**
 * Whether an availability value means the tenant may use the feature *now*.
 *
 * ADDON is deliberately false: "Optional" on the price sheet means the plan
 * permits buying it, not that it is active. The resolver upgrades ADDON to
 * usable only after finding the matching purchased add-on.
 */
export function isFeatureUsable(availability: FeatureAvailability): boolean {
  return availability === 'INCLUDED' || availability === 'LIMITED'
}

export const AVAILABILITY_LABELS: Record<FeatureAvailability, string> = {
  UNAVAILABLE: 'Not included',
  ADDON: 'Optional add-on',
  LIMITED: 'Limited',
  INCLUDED: 'Included',
}

export const SUPPORT_TIER_LABELS: Record<SupportTier, string> = {
  COMMUNITY: 'Community',
  STANDARD: 'Standard',
  PRIORITY: 'Priority',
  DEDICATED: 'Dedicated',
}

// ── Units ─────────────────────────────────────────────────────────────────

const BYTES_PER_MB = 1024 * 1024

export function mbToBytes(mb: number): number {
  return mb * BYTES_PER_MB
}

export function bytesToMb(bytes: number): number {
  return bytes / BYTES_PER_MB
}

/**
 * Human byte sizes: 524288000 -> "500 MB", 5368709120 -> "5 GB".
 *
 * Binary units with decimal-looking labels, matching how the price sheet reads
 * ("500 MB", "5 GB", "20 GB") and how every hosting dashboard displays a cap.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }

  const rounded =
    value >= 100 || Number.isInteger(value)
      ? Math.round(value)
      : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

/** A quota for display: null becomes "Unlimited", bytes get formatted. */
export function formatQuota(limit: number | null, unit: QuotaUnit): string {
  if (limit === null) return 'Unlimited'
  if (unit === 'bytes') return formatBytes(limit)
  return new Intl.NumberFormat('en-US').format(limit)
}

/** `formatQuota` for a usage figure — always a real number, never unlimited. */
export function formatUsage(used: number, unit: QuotaUnit): string {
  if (unit === 'bytes') return formatBytes(used)
  return new Intl.NumberFormat('en-US').format(used)
}

// ── Billing period ────────────────────────────────────────────────────────

/**
 * The period key a monthly usage counter is filed under: "2026-08".
 *
 * UTC, not local time. A counter keyed by the server's local month would roll
 * over at a different instant than the one the tenant sees, and two app
 * instances in different zones would write to different rows for the same
 * traffic.
 */
export function usagePeriodKey(at: Date = new Date()): string {
  const year = at.getUTCFullYear()
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** Period key for metrics that measure a current level rather than a flow. */
export const CURRENT_PERIOD = 'current'

export function annualSavingsPercent(
  monthlyPriceCents: number,
  annualPriceCents: number | null
): number | null {
  if (!annualPriceCents || monthlyPriceCents <= 0) return null
  const fullYear = monthlyPriceCents * 12
  if (annualPriceCents >= fullYear) return null
  return Math.round(((fullYear - annualPriceCents) / fullYear) * 100)
}
