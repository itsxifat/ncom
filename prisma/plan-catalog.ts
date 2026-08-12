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
  {
    code: 'FREE',
    name: 'Free',
    tagline: 'Publish one landing page on an NCOM subdomain.',
    position: 1,
    isDefault: true,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 0,
    annualPriceCents: null,

    maxPages: 1,
    maxStores: 1,
    maxCustomDomains: 0,
    maxTeamMembers: 1,
    storageMb: 500 * MB,
    monthlyTrafficMb: 5 * GB,
    monthlyVisitors: 5_000,

    supportTier: 'COMMUNITY',
  },
  {
    code: 'STARTER',
    name: 'Starter',
    tagline: 'Your own domain, premium templates and the analytics stack.',
    position: 2,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 39_900,
    annualPriceCents: 399_000,

    maxPages: 5,
    maxStores: 1,
    maxCustomDomains: 1,
    maxTeamMembers: 1,
    storageMb: 5 * GB,
    monthlyTrafficMb: 100 * GB,
    monthlyVisitors: 100_000,

    premiumTemplates: 'INCLUDED',
    advancedSeo: 'INCLUDED',
    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    googleTagManager: 'INCLUDED',
    // "Optional" on the price sheet: permitted at this tier, but only after the
    // add-on is bought.
    aiContentAssistant: 'ADDON',
    advancedAnalytics: 'ADDON',

    supportTier: 'STANDARD',
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    tagline: 'Unlimited pages, five domains, AI included, priority support.',
    position: 3,
    isPublic: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 79_900,
    annualPriceCents: 799_000,

    maxPages: null,
    maxStores: 5,
    maxCustomDomains: 5,
    maxTeamMembers: 2,
    storageMb: 20 * GB,
    // The sheet says "Unlimited*". The asterisk is the fair-use note below, and
    // `enforceTrafficCap` stays true with a null limit — unlimited is unlimited,
    // the flag only decides what happens when a limit exists.
    monthlyTrafficMb: null,
    monthlyVisitors: null,
    fairUseNote:
      'Unlimited under fair use. Sustained bandwidth far above plan norms may be discussed with you before any change.',

    premiumTemplates: 'INCLUDED',
    advancedSeo: 'INCLUDED',
    googleAnalytics: 'INCLUDED',
    metaPixel: 'INCLUDED',
    googleTagManager: 'INCLUDED',
    aiContentAssistant: 'INCLUDED',
    advancedAnalytics: 'ADDON',
    dedicatedAccountManager: 'INCLUDED',
    dedicatedTechnicalSupport: 'LIMITED',

    supportTier: 'PRIORITY',
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    tagline: 'Custom limits, white label, dedicated support.',
    position: 4,
    isPublic: true,
    isContactSalesOnly: true,
    currencyCode: 'BDT',
    monthlyPriceCents: 0,
    annualPriceCents: null,

    maxPages: null,
    maxStores: null,
    maxCustomDomains: null,
    maxTeamMembers: null,
    storageMb: null,
    monthlyTrafficMb: null,
    monthlyVisitors: null,

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
