/**
 * Puts the package lineup in prisma/plan-catalog.ts onto an existing database.
 *
 *   pnpm exec tsx scripts/apply-plan-lineup.mts           # show what would change
 *   pnpm exec tsx scripts/apply-plan-lineup.mts --apply   # change it
 *
 * The seed only creates missing plans and never edits one (/admin/plans owns
 * them after that). A new lineup is a deliberate decision to overwrite, so it
 * is this separate, explicit step:
 *
 *   - every package in PLAN_SEEDS is created, or updated to exactly the catalog
 *     — prices, limits, features, trial days; a feature the catalog does not
 *     list is set back to "not available". AI credit allowances are left as an
 *     admin set them.
 *   - retired packages (Free) are closed: not active, not public, not default.
 *     The rows stay, because past orders point at them.
 *   - workspaces still on a retired package lose that subscription, so they
 *     read as "no package yet" and are sent to choose one — with the free trial
 *     they have not used. Nothing they built is touched.
 *
 * Idempotent: running it again changes nothing.
 */
import { prisma } from '../src/server/db/client'
import { PLAN_SEEDS, RETIRED_PLAN_CODES } from '../prisma/plan-catalog'

const apply = process.argv.includes('--apply')

const FEATURE_DEFAULTS = {
  premiumTemplates: 'UNAVAILABLE',
  advancedSeo: 'UNAVAILABLE',
  googleAnalytics: 'UNAVAILABLE',
  metaPixel: 'UNAVAILABLE',
  googleTagManager: 'UNAVAILABLE',
  aiContentAssistant: 'UNAVAILABLE',
  advancedAnalytics: 'UNAVAILABLE',
  whiteLabel: 'UNAVAILABLE',
  dedicatedAccountManager: 'UNAVAILABLE',
  dedicatedTechnicalSupport: 'UNAVAILABLE',
} as const

const COMPARED = [
  'name',
  'isActive',
  'isPublic',
  'isDefault',
  'isContactSalesOnly',
  'monthlyPriceCents',
  'annualPriceCents',
  'trialDays',
  'maxStores',
  'maxPages',
  'maxCustomDomains',
  'maxTeamMembers',
  'storageMb',
  'monthlyTrafficMb',
  'monthlyVisitors',
  'supportTier',
  ...Object.keys(FEATURE_DEFAULTS),
] as const

async function main() {
  console.log(apply ? 'Applying the package lineup.\n' : 'Dry run — nothing is written. Pass --apply to write.\n')

  for (const seed of PLAN_SEEDS) {
    const wanted = {
      ...FEATURE_DEFAULTS,
      isActive: true,
      isDefault: false,
      isContactSalesOnly: false,
      fairUseNote: null,
      enforceTrafficCap: true,
      enforceVisitorCap: false,
      ...seed,
    }
    const existing = await prisma.plan.findUnique({ where: { code: seed.code } })
    if (!existing) {
      console.log(`+ ${seed.code}: create (${seed.name}, ৳${(seed.monthlyPriceCents ?? 0) / 100}/month)`)
      if (apply) await prisma.plan.create({ data: wanted })
      continue
    }
    const changes = COMPARED.filter(
      (key) =>
        JSON.stringify((existing as Record<string, unknown>)[key]) !==
        JSON.stringify((wanted as Record<string, unknown>)[key])
    ).map(
      (key) =>
        `${key} ${JSON.stringify((existing as Record<string, unknown>)[key])} → ${JSON.stringify((wanted as Record<string, unknown>)[key])}`
    )
    if (changes.length === 0) {
      console.log(`= ${seed.code}: already up to date`)
      continue
    }
    console.log(`~ ${seed.code}:\n    ${changes.join('\n    ')}`)
    if (apply) {
      const update: Record<string, unknown> = { ...wanted }
      delete update.code
      await prisma.plan.update({ where: { code: seed.code }, data: update })
    }
  }

  const retired = await prisma.plan.findMany({
    where: { code: { in: RETIRED_PLAN_CODES } },
    select: { id: true, code: true, isActive: true, isPublic: true, isDefault: true },
  })
  for (const plan of retired) {
    if (plan.isActive || plan.isPublic || plan.isDefault) {
      console.log(`- ${plan.code}: retire (inactive, hidden, not default)`)
      if (apply) {
        await prisma.plan.update({
          where: { id: plan.id },
          data: { isActive: false, isPublic: false, isDefault: false },
        })
      }
    } else {
      console.log(`= ${plan.code}: already retired`)
    }
  }

  const stranded = await prisma.subscription.findMany({
    where: { planId: { in: retired.map((plan) => plan.id) } },
    select: { id: true, status: true, organization: { select: { name: true } } },
  })
  if (stranded.length > 0) {
    console.log(
      `\n${stranded.length} workspace(s) on a retired package will be asked to choose a package:`
    )
    for (const row of stranded) {
      console.log(`    ${row.organization.name} (${row.status})`)
    }
    if (apply) {
      await prisma.subscription.deleteMany({
        where: { id: { in: stranded.map((row) => row.id) } },
      })
    }
  }

  const defaults = await prisma.plan.count({ where: { isDefault: true, isActive: true } })
  console.log(
    `\nDefault package for new workspaces: ${defaults === 0 ? 'none — they choose (as intended)' : `${defaults} marked default`}`
  )
  console.log(apply ? '\nDone.' : '\nNothing written.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
