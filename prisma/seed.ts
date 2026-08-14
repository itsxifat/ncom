import { prisma } from '../src/server/db/client'
import { ADDON_SEEDS, LAUNCH_COUPON, PLAN_SEEDS } from './plan-catalog'

/**
 * Seeds the commercial catalogue only: plans, add-ons and the launch coupon.
 *
 * There is nothing else left to seed. The block catalogue lives in
 * modules/sections/registry.ts and is resolved at render time, so there are no
 * component or template rows to keep in step with the code.
 *
 * No users and no organisations. There is deliberately no seeded administrator:
 * a default account with a known email and a `changeme123` password is a
 * credential every copy of this repository shares, and the one that survives to
 * production is how platforms get taken over. The first person to register
 * claims the administrator role instead — see `claimFirstAdmin` in
 * server/services/authService.ts.
 */
async function main() {
  await seedPlanCatalog()
  await seedSubscriptionsForExistingOrganizations()
}

/**
 * Seeds the published price sheet, add-ons and the exploration coupon.
 *
 * Create-if-missing, never update. After the first run /admin/plans owns these
 * rows, and a re-seed (which happens on every `db:seed`, including in CI and on
 * a colleague's machine) must not silently revert a price or a quota someone
 * changed there. Codes are the identity, so a renamed plan is still recognised.
 */
async function seedPlanCatalog() {
  let createdPlans = 0
  for (const plan of PLAN_SEEDS) {
    const existing = await prisma.plan.findUnique({
      where: { code: plan.code },
    })
    if (existing) continue
    await prisma.plan.create({ data: plan })
    createdPlans++
  }
  console.log(
    `Seeded ${createdPlans} plans (${PLAN_SEEDS.length} in catalogue)`
  )

  let createdAddons = 0
  for (const addon of ADDON_SEEDS) {
    const existing = await prisma.addon.findUnique({
      where: { code: addon.code },
    })
    if (existing) continue
    await prisma.addon.create({ data: addon })
    createdAddons++
  }
  console.log(
    `Seeded ${createdAddons} add-ons (${ADDON_SEEDS.length} in catalogue)`
  )

  const existingCoupon = await prisma.planCoupon.findUnique({
    where: { code: LAUNCH_COUPON.code },
  })
  if (!existingCoupon) {
    await prisma.planCoupon.create({
      // No creator: seeded before any account exists. `createdById` records
      // which admin wrote a coupon, and nobody did.
      data: LAUNCH_COUPON,
    })
    console.log(`Seeded launch coupon: ${LAUNCH_COUPON.code}`)
  }
}

/**
 * Puts every organisation that predates the subscription model onto the default
 * plan.
 *
 * `ensureSubscription` would do this lazily on first request, but a tenant whose
 * quotas only materialise when someone visits their dashboard is invisible in
 * the admin subscription list until then — which is where support looks first.
 */
async function seedSubscriptionsForExistingOrganizations() {
  const defaultPlan = await prisma.plan.findFirst({
    where: { isDefault: true },
  })
  if (!defaultPlan) return

  const orphaned = await prisma.organization.findMany({
    where: { subscription: null },
    select: { id: true },
  })
  if (orphaned.length === 0) return

  await prisma.subscription.createMany({
    data: orphaned.map((org) => ({
      organizationId: org.id,
      planId: defaultPlan.id,
      status: 'ACTIVE' as const,
      interval: 'MONTHLY' as const,
      currencyCode: defaultPlan.currencyCode,
      unitPriceCents: defaultPlan.monthlyPriceCents,
    })),
    skipDuplicates: true,
  })
  console.log(
    `Subscribed ${orphaned.length} existing organizations to ${defaultPlan.name}`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
