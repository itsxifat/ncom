import type { Prisma } from '../src/generated/prisma/client'

/**
 * The published price sheet, as data.
 *
 * This is seed input, not runtime configuration: once seeded, /admin/plans is
 * the source of truth and re-running the seed must not stamp on a price an
 * admin has since changed. `seedPlanCatalog` therefore creates missing rows and
 * leaves existing ones alone.
 *
 * Prices are paisa (BDT minor units). Annual figures are ten monthly payments,
 * i.e. two months free, exactly as advertised.
 *
 * A null quota means unlimited; 0 means none allowed. See lib/plans.ts.
 */

const MB = 1
const GB = 1024 * MB

export const PLAN_SEEDS: Prisma.PlanCreateInput[] = [
  // Five packages, no free tier and nothing unlimited — approved 2026-11-18.
  //
  // Each is priced for about a 70% margin with every limit used in full
  // (assumed costs, VAT 15% inside the price: ৳15 per workspace, ৳5 per site,
  // ৳10 per custom domain, ৳3 per GB stored, ৳1 per GB served, 2% payment
  // fee; AI credits are sold as their own packs, so none are included). Real
  // use sits far below the limits, so the real margin is higher. Yearly is 11
  // monthly payments — one month free — which keeps that margin near 70% too.
  //
  // A 7-day trial on every package but Enterprise; /admin/plans changes it per
  // package (0 = no trial). No package is the default: a workspace chooses.
  {
    code: 'LITE',
    name: 'Lite',
    tagline: 'One site on an NCOM address — everything to start selling.',
    position: 1,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 19_900,
    annualPriceCents: 219_000,
    trialDays: 7,

    maxPages: 3,
    maxStores: 1,
    maxCustomDomains: 0,
    maxTeamMembers: 1,
    storageMb: 1 * GB,
    monthlyTrafficMb: 20 * GB,
    monthlyVisitors: 20_000,

    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    // The sales report is part of running a shop, not a premium extra.
    advancedAnalytics: 'INCLUDED',
    aiContentAssistant: 'ADDON',

    supportTier: 'STANDARD',
  },
  {
    code: 'STARTER',
    name: 'Starter',
    tagline: 'Your own domain, premium templates and the full ads toolkit.',
    position: 2,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 39_900,
    annualPriceCents: 439_000,
    trialDays: 7,

    maxPages: 10,
    maxStores: 1,
    maxCustomDomains: 1,
    maxTeamMembers: 1,
    storageMb: 3 * GB,
    monthlyTrafficMb: 50 * GB,
    monthlyVisitors: 50_000,

    premiumTemplates: 'INCLUDED',
    advancedSeo: 'INCLUDED',
    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    googleTagManager: 'INCLUDED',
    advancedAnalytics: 'INCLUDED',
    // "Optional": permitted at this tier, but only after the add-on is bought.
    aiContentAssistant: 'ADDON',

    supportTier: 'STANDARD',
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    tagline: 'Three sites, three domains, AI included, priority support.',
    position: 3,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 99_900,
    annualPriceCents: 1_099_000,
    trialDays: 7,

    maxPages: 40,
    maxStores: 3,
    maxCustomDomains: 3,
    maxTeamMembers: 3,
    storageMb: 10 * GB,
    monthlyTrafficMb: 120 * GB,
    monthlyVisitors: 120_000,

    premiumTemplates: 'INCLUDED',
    advancedSeo: 'INCLUDED',
    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    googleTagManager: 'INCLUDED',
    aiContentAssistant: 'INCLUDED',
    advancedAnalytics: 'INCLUDED',

    supportTier: 'PRIORITY',
  },
  {
    code: 'PRO',
    name: 'Pro',
    tagline: 'Eight sites for a growing brand, with an account manager.',
    position: 4,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 199_900,
    annualPriceCents: 2_199_000,
    trialDays: 7,

    maxPages: 120,
    maxStores: 8,
    maxCustomDomains: 8,
    maxTeamMembers: 5,
    storageMb: 25 * GB,
    monthlyTrafficMb: 250 * GB,
    monthlyVisitors: 250_000,

    premiumTemplates: 'INCLUDED',
    advancedSeo: 'INCLUDED',
    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    googleTagManager: 'INCLUDED',
    aiContentAssistant: 'INCLUDED',
    advancedAnalytics: 'INCLUDED',
    dedicatedAccountManager: 'INCLUDED',

    supportTier: 'PRIORITY',
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    tagline: 'Twenty sites, white label and dedicated technical support.',
    position: 5,
    isPublic: true,
    isContactSalesOnly: false,
    currencyCode: 'BDT',
    monthlyPriceCents: 499_900,
    annualPriceCents: 5_499_000,
    trialDays: 0,

    maxPages: 400,
    maxStores: 20,
    maxCustomDomains: 20,
    maxTeamMembers: 10,
    storageMb: 60 * GB,
    monthlyTrafficMb: 600 * GB,
    monthlyVisitors: 600_000,

    premiumTemplates: 'INCLUDED',
    advancedSeo: 'INCLUDED',
    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    googleTagManager: 'INCLUDED',
    aiContentAssistant: 'INCLUDED',
    advancedAnalytics: 'INCLUDED',
    whiteLabel: 'INCLUDED',
    dedicatedAccountManager: 'INCLUDED',
    dedicatedTechnicalSupport: 'INCLUDED',

    supportTier: 'DEDICATED',
  },
]

/** Packages the lineup above replaced. Kept as rows (orders point at them), but closed. */
export const RETIRED_PLAN_CODES = ['FREE']

export const ADDON_SEEDS: Prisma.AddonCreateInput[] = [
  {
    code: 'EXTRA_CUSTOM_DOMAIN',
    name: 'Extra custom domain',
    description: 'One additional custom domain on any of your sites.',
    position: 1,
    currencyCode: 'BDT',
    monthlyPriceCents: 9_900,
    annualPriceCents: 99_000,
    grantsCustomDomains: 1,
    maxQuantity: null,
  },
  {
    code: 'EXTRA_STORAGE_5GB',
    name: 'Extra 5 GB storage',
    description: 'Adds 5 GB of media storage.',
    position: 2,
    currencyCode: 'BDT',
    monthlyPriceCents: 19_900,
    annualPriceCents: 199_000,
    grantsStorageMb: 5 * GB,
    maxQuantity: null,
  },
  {
    code: 'EXTRA_TRAFFIC_100GB',
    name: 'Extra 100 GB monthly traffic',
    description: 'Adds 100 GB to your monthly traffic allowance.',
    position: 3,
    currencyCode: 'BDT',
    monthlyPriceCents: 19_900,
    annualPriceCents: 199_000,
    grantsTrafficMb: 100 * GB,
    maxQuantity: null,
  },
  {
    code: 'EXTRA_TEAM_MEMBER',
    name: 'Additional team member',
    description: 'One more seat in your workspace.',
    position: 4,
    currencyCode: 'BDT',
    monthlyPriceCents: 19_900,
    annualPriceCents: 199_000,
    grantsTeamMembers: 1,
    maxQuantity: null,
  },
  {
    code: 'AI_CONTENT_ASSISTANT',
    name: 'AI content assistant',
    description: 'Generate and rewrite page copy inside the builder.',
    position: 5,
    currencyCode: 'BDT',
    monthlyPriceCents: 39_900,
    annualPriceCents: 399_000,
    grantsFeature: 'AI_CONTENT_ASSISTANT',
    // A switch, not a quantity: buying it twice would not do anything.
    maxQuantity: 1,
  },
  {
    code: 'ADVANCED_ANALYTICS',
    name: 'Advanced analytics',
    description: 'Funnels, retention and per-section engagement reporting.',
    position: 6,
    currencyCode: 'BDT',
    monthlyPriceCents: 29_900,
    annualPriceCents: 299_000,
    grantsFeature: 'ADVANCED_ANALYTICS',
    maxQuantity: 1,
  },
]

/**
 * The onboarding code: every plan free, forever, for whoever you give it to.
 *
 * Knowing the code is the only gate, deliberately. `existingCustomersOnly` was
 * the obvious rule to reach for and it is the wrong one here: its cutoff is the
 * coupon's own creation time, so a coupon seeded into a fresh database is dead on
 * arrival — every workspace that could ever use it is created *after* the seed
 * ran, and all of them fail the rule. Use the eligibility rules in
 * /admin/coupons for a real cohort, where the cutoff can be a date you chose
 * rather than whenever the seed happened to run.
 *
 * `maxRedemptionsPerOrg: null` lets one workspace try Starter, then Business,
 * without the first attempt burning the code.
 */
export const LAUNCH_COUPON: Prisma.PlanCouponCreateInput = {
  code: 'NCOMEXPLORE',
  name: 'Explore any plan free',
  description:
    'Full access to any plan at no cost while NCOM is in its exploration phase.',
  discountType: 'FREE',
  duration: 'FOREVER',
  currencyCode: 'BDT',
  appliesToAllPlans: true,
  appliesToAddons: true,
  maxRedemptionsPerOrg: null,
  isStackable: false,
}
