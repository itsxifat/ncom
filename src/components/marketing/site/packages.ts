/**
 * The packages as the public site shows them — read live from the Plan table,
 * so the price sheet, the homepage and the dashboard can never disagree.
 *
 * Plain data and pure helpers: safe for server and client components alike.
 */

export type Availability = 'UNAVAILABLE' | 'ADDON' | 'LIMITED' | 'INCLUDED'

export interface PublicPackage {
  code: string
  name: string
  tagline: string | null
  monthlyPriceCents: number
  annualPriceCents: number | null
  trialDays: number
  isContactSalesOnly: boolean
  maxStores: number | null
  maxPages: number | null
  maxCustomDomains: number | null
  maxTeamMembers: number | null
  storageMb: number | null
  monthlyTrafficMb: number | null
  monthlyVisitors: number | null
  supportTier: 'COMMUNITY' | 'STANDARD' | 'PRIORITY' | 'DEDICATED'
  premiumTemplates: Availability
  advancedSeo: Availability
  googleAnalytics: Availability
  metaPixel: Availability
  googleTagManager: Availability
  aiContentAssistant: Availability
  advancedAnalytics: Availability
  whiteLabel: Availability
  dedicatedAccountManager: Availability
  dedicatedTechnicalSupport: Availability
}

/** The one package the design calls out. */
export const FEATURED_CODE = 'STARTER'
export const FEATURED_BADGE = 'For ad sellers'

/** Picks the public fields off a Plan row (drops dates and internals). */
export function toPublicPackage(plan: PublicPackage): PublicPackage {
  const {
    code,
    name,
    tagline,
    monthlyPriceCents,
    annualPriceCents,
    trialDays,
    isContactSalesOnly,
    maxStores,
    maxPages,
    maxCustomDomains,
    maxTeamMembers,
    storageMb,
    monthlyTrafficMb,
    monthlyVisitors,
    supportTier,
    premiumTemplates,
    advancedSeo,
    googleAnalytics,
    metaPixel,
    googleTagManager,
    aiContentAssistant,
    advancedAnalytics,
    whiteLabel,
    dedicatedAccountManager,
    dedicatedTechnicalSupport,
  } = plan
  return {
    code,
    name,
    tagline,
    monthlyPriceCents,
    annualPriceCents,
    trialDays,
    isContactSalesOnly,
    maxStores,
    maxPages,
    maxCustomDomains,
    maxTeamMembers,
    storageMb,
    monthlyTrafficMb,
    monthlyVisitors,
    supportTier,
    premiumTemplates,
    advancedSeo,
    googleAnalytics,
    metaPixel,
    googleTagManager,
    aiContentAssistant,
    advancedAnalytics,
    whiteLabel,
    dedicatedAccountManager,
    dedicatedTechnicalSupport,
  }
}

/** ৳1,999 — whole taka, the way the price sheet writes it. */
export function taka(cents: number): string {
  return `৳${Math.round(cents / 100).toLocaleString('en-US')}`
}

const WORDS = ['no', 'one', 'two', 'three', 'four']

/** "one month free" for a year priced at 11 months; null when there is no saving. */
export function yearlySaving(pkg: PublicPackage): string | null {
  if (!pkg.annualPriceCents || pkg.monthlyPriceCents <= 0) return null
  const months = Math.round(12 - pkg.annualPriceCents / pkg.monthlyPriceCents)
  if (months <= 0) return null
  const word = WORDS[months] ?? String(months)
  return `${word} month${months === 1 ? '' : 's'} free`
}

export function count(n: number | null, one: string, many = `${one}s`): string {
  if (n === null) return `Unlimited ${many}`
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** 1024 MB → "1 GB"; 600 GB stays in GB. */
export function size(mb: number | null): string {
  if (mb === null) return 'Unlimited'
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${mb} MB`
}

const on = (value: Availability) => value === 'INCLUDED' || value === 'LIMITED'

/** The short list on a package card: limits first, then what it adds. */
export function cardLines(pkg: PublicPackage): string[] {
  const lines = [
    `${count(pkg.maxStores, 'site')}, ${count(pkg.maxPages, 'page')}`,
    pkg.maxCustomDomains
      ? `${count(pkg.maxCustomDomains, 'custom domain')} + NCOM address`
      : 'NCOM address with SSL',
  ]
  if (pkg.maxTeamMembers !== 1)
    lines.push(count(pkg.maxTeamMembers, 'team member'))
  lines.push(
    on(pkg.googleTagManager)
      ? 'Pixel + Conversions API, GA4, Tag Manager'
      : 'Meta Pixel + Conversions API, GA4'
  )
  if (on(pkg.aiContentAssistant)) lines.push('AI content assistant included')
  if (on(pkg.whiteLabel)) lines.push('White label')
  if (on(pkg.dedicatedTechnicalSupport))
    lines.push('Dedicated technical support')
  else if (on(pkg.dedicatedAccountManager)) lines.push('Account manager')
  else if (pkg.supportTier === 'PRIORITY') lines.push('Priority support')
  lines.push(
    `${size(pkg.storageMb)} photos · ${size(pkg.monthlyTrafficMb)} traffic a month`
  )
  return lines
}

/** Every row of the comparison table on /pricing. */
export const COMPARISON: {
  group: string
  rows: { label: string; value: (pkg: PublicPackage) => string | boolean }[]
}[] = [
  {
    group: 'Limits',
    rows: [
      {
        label: 'Sites (landing pages or stores)',
        value: (p) => count(p.maxStores, 'site'),
      },
      { label: 'Pages', value: (p) => count(p.maxPages, 'page') },
      {
        label: 'Custom domains',
        value: (p) => (p.maxCustomDomains ? String(p.maxCustomDomains) : false),
      },
      {
        label: 'Team members',
        value: (p) => count(p.maxTeamMembers, 'person', 'people'),
      },
      { label: 'Photo storage', value: (p) => size(p.storageMb) },
      { label: 'Traffic a month', value: (p) => size(p.monthlyTrafficMb) },
      {
        label: 'Visitors a month (recommended)',
        value: (p) =>
          p.monthlyVisitors === null
            ? 'Unlimited'
            : p.monthlyVisitors.toLocaleString('en-US'),
      },
    ],
  },
  {
    group: 'Selling',
    rows: [
      { label: 'Order form, offers and delivery charges', value: () => true },
      { label: 'Online store with cart and checkout', value: () => true },
      {
        label: 'Fake-order check, courier booking, stickers',
        value: () => true,
      },
      { label: 'Buyer tracking links', value: () => true },
      { label: 'NCOM address with SSL', value: () => true },
      { label: 'Premium templates', value: (p) => feature(p.premiumTemplates) },
      { label: 'Advanced SEO', value: (p) => feature(p.advancedSeo) },
    ],
  },
  {
    group: 'Ads & reports',
    rows: [
      {
        label: 'Meta Pixel + Conversions API',
        value: (p) => feature(p.metaPixel),
      },
      { label: 'Google Analytics 4', value: (p) => feature(p.googleAnalytics) },
      {
        label: 'Google Tag Manager',
        value: (p) => feature(p.googleTagManager),
      },
      {
        label: 'Sales report: invoiced vs collected',
        value: (p) => feature(p.advancedAnalytics),
      },
    ],
  },
  {
    group: 'AI & support',
    rows: [
      { label: 'Build with AI (uses credits)', value: () => true },
      {
        label: 'AI content assistant',
        value: (p) => feature(p.aiContentAssistant),
      },
      { label: 'White label', value: (p) => feature(p.whiteLabel) },
      { label: 'Support', value: (p) => SUPPORT[p.supportTier] },
      {
        label: 'Account manager',
        value: (p) => feature(p.dedicatedAccountManager),
      },
      {
        label: 'Dedicated technical support',
        value: (p) => feature(p.dedicatedTechnicalSupport),
      },
    ],
  },
]

const SUPPORT: Record<PublicPackage['supportTier'], string> = {
  COMMUNITY: 'Help centre',
  STANDARD: 'Email & WhatsApp',
  PRIORITY: 'Priority',
  DEDICATED: 'Dedicated',
}

function feature(value: Availability): string | boolean {
  if (value === 'ADDON') return 'Add-on'
  if (value === 'LIMITED') return 'Limited'
  return value === 'INCLUDED'
}

/** "Lite, Starter, Business and Pro" — the packages with a trial, in order. */
export function trialPackageNames(packages: PublicPackage[]): string {
  const names = packages.filter((p) => p.trialDays > 0).map((p) => p.name)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
