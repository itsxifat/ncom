import { prisma } from '../src/server/db/client'
import { sectionRegistry } from '../src/modules/sections/registry'
import { DEFAULT_THEME } from '../src/lib/default-theme'
import { BUILTIN_LIQUID_SECTIONS } from '../src/lib/liquid/builtin-sections'
import {
  compileSchemaToFields,
  defaultContentFromSchema,
  extractSection,
} from '../src/lib/liquid/schema'
import { LANDING_TEMPLATES } from './landing-templates'
import { ADDON_SEEDS, LAUNCH_COUPON, PLAN_SEEDS } from './plan-catalog'

/**
 * Seeds platform assets only: template categories, section definitions, landing
 * templates, plans, add-ons and the launch coupon.
 *
 * No users and no organisations. There is deliberately no seeded administrator:
 * a default account with a known email and a `changeme123` password is a
 * credential every copy of this repository shares, and the one that survives to
 * production is how platforms get taken over. The first person to register
 * claims the administrator role instead — see `claimFirstAdmin` in
 * server/services/authService.ts.
 */
async function main() {
  // Every store on this platform sells something, so the catalogue is
  // organised by what a merchant sells rather than by website genre. Portfolio
  // and SaaS categories were removed with the landing-page product.
  const categories = [
    { name: 'Fashion & apparel', slug: 'fashion', sortOrder: 1 },
    { name: 'Beauty & cosmetics', slug: 'beauty', sortOrder: 2 },
    { name: 'Electronics', slug: 'electronics', sortOrder: 3 },
    { name: 'Food & grocery', slug: 'food', sortOrder: 4 },
    { name: 'Home & living', slug: 'home', sortOrder: 5 },
    { name: 'Jewellery', slug: 'jewellery', sortOrder: 6 },
    { name: 'Single product', slug: 'single-product', sortOrder: 7 },
    { name: 'General store', slug: 'general', sortOrder: 8 },
  ]

  for (const category of categories) {
    await prisma.templateCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    })
  }
  console.log(`Seeded ${categories.length} template categories`)

  const sectionEntries = Object.values(sectionRegistry)
  for (const [index, section] of sectionEntries.entries()) {
    await prisma.componentDefinition.upsert({
      where: { key: section.key },
      update: {
        name: section.name,
        category: section.category,
        defaultContent: section.defaultContent as object,
      },
      create: {
        key: section.key,
        name: section.name,
        category: section.category,
        defaultContent: section.defaultContent as object,
        sortOrder: index,
      },
    })
  }
  console.log(`Seeded ${sectionEntries.length} component definitions`)

  await seedBuiltinLiquidSections()
  await seedLandingTemplates()
  await retireRemovedSections()
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

/**
 * Deletes component definitions that no longer exist in either library.
 *
 * The section library shrank when the platform narrowed to cash-on-delivery
 * landing pages: the brochure-ware inherited from the website-builder era
 * (navbar, hero, services, cards, statistics, contact, newsletter…) and the
 * React sections since superseded by a Liquid commerce equivalent
 * (testimonials → reviews, pricing → bundle-offer, gallery → gallery-strip)
 * are gone from the registry, but a definition row already in the database
 * would keep them in every merchant's Add-section palette forever.
 *
 * Pages still carrying a retired section are cleaned first. `PageSection`'s
 * relation is `onDelete: Restrict`, so this is a deliberate two-step rather
 * than a cascade — deleting a definition must never silently take live page
 * content with it, and the count is logged so an unexpectedly large number is
 * visible rather than quiet.
 *
 * Imported sections (a merchant's own pasted Liquid) are owned by an
 * organisation and are never platform-managed, so they are left alone.
 */
async function retireRemovedSections() {
  const live = new Set<string>([
    ...Object.values(sectionRegistry).map((section) => section.key),
    ...BUILTIN_LIQUID_SECTIONS.map((section) => section.key),
  ])

  const retired = await prisma.componentDefinition.findMany({
    where: { key: { notIn: [...live] }, ownerOrganizationId: null },
    select: { id: true, key: true, _count: { select: { pageSections: true } } },
  })
  if (retired.length === 0) return

  const ids = retired.map((definition) => definition.id)
  const orphanedSections = retired.reduce(
    (total, definition) => total + definition._count.pageSections,
    0
  )

  await prisma.pageSection.deleteMany({
    where: { componentDefinitionId: { in: ids } },
  })
  await prisma.templateSection.deleteMany({
    where: { componentDefinitionId: { in: ids } },
  })
  await prisma.componentDefinition.deleteMany({ where: { id: { in: ids } } })

  console.log(
    `Retired ${retired.length} removed section(s): ${retired
      .map((definition) => definition.key)
      .join(', ')}` +
      (orphanedSections > 0
        ? ` — and ${orphanedSections} page section(s) that used them`
        : '')
  )
}

/**
 * Two published templates so the gallery (Phase 6) isn't empty and the

/**
 * Registers the built-in Liquid commerce sections.
 *
 * These carry their editor UI in their own `{% schema %}` block, so the schema
 * is compiled here and stored alongside the source — exactly the shape a
 * merchant's own pasted Liquid produces. Storing the compiled fields rather
 * than recompiling per request keeps the builder's palette a single query.
 *
 * Upserted by key so re-running the seed picks up edits to a section's markup
 * without orphaning pages that already use it.
 */
async function seedBuiltinLiquidSections() {
  for (const [index, section] of BUILTIN_LIQUID_SECTIONS.entries()) {
    const { template, schema, error } = extractSection(section.source)
    if (error || !schema) {
      throw new Error(
        `Built-in section "${section.key}" has a broken schema: ${error}`
      )
    }

    const payload = {
      name: schema.name || section.name,
      category: schema.category ?? section.category,
      renderMode: 'LIQUID' as const,
      liquidSource: template,
      schemaJson: {
        schema,
        editorFields: compileSchemaToFields(schema),
      } as object,
      defaultContent: defaultContentFromSchema(schema) as object,
      isActive: true,
      // After the React sections, so commerce blocks group together in the
      // palette rather than interleaving with layout blocks.
      sortOrder: 100 + index,
    }

    await prisma.componentDefinition.upsert({
      where: { key: section.key },
      update: payload,
      create: { key: section.key, ...payload },
    })
  }

  console.log(
    `Seeded ${BUILTIN_LIQUID_SECTIONS.length} Liquid commerce sections`
  )
}

/**
 * Replaces the template catalogue with the ten landing pages.
 *
 * Deletes every existing template first, deliberately: the old catalogue was
 * generic website starters from before this became an ecommerce-only platform,
 * and leaving them alongside pages that actually sell would offer merchants a
 * choice between a store and a brochure. Stores already created from an old
 * template are unaffected — applying a template copies its sections onto the
 * page, so nothing on a live store points back at the template row.
 */
async function seedLandingTemplates() {
  const removed = await prisma.template.deleteMany({})
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} old template(s)`)
  }

  const definitions = await prisma.componentDefinition.findMany({
    select: { id: true, key: true, defaultContent: true },
  })
  const byKey = new Map(
    definitions.map((definition) => [definition.key, definition])
  )

  const categories = await prisma.templateCategory.findMany({
    select: { id: true, slug: true },
  })
  const categoryBySlug = new Map(
    categories.map((category) => [category.slug, category.id])
  )

  for (const seed of LANDING_TEMPLATES) {
    const template = await prisma.template.create({
      data: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        categoryId: categoryBySlug.get(seed.categorySlug),
        status: 'PUBLISHED',
        defaultTheme: { ...DEFAULT_THEME, ...seed.theme } as object,
        createdById: null,
      },
      select: { id: true },
    })

    let order = 0
    for (const entry of seed.sections) {
      const definition = byKey.get(entry.key)
      if (!definition) {
        throw new Error(
          `Template "${seed.slug}" references unknown section "${entry.key}"`
        )
      }

      // The section's own defaults underneath the template's overrides, so a
      // template only has to state what it changes and a new setting added to
      // a section later still arrives with a sane value.
      const base = (definition.defaultContent ?? {}) as Record<string, unknown>

      await prisma.templateSection.create({
        data: {
          templateId: template.id,
          componentDefinitionId: definition.id,
          order: order++,
          defaultContent: { ...base, ...(entry.content ?? {}) } as object,
          defaultConfig: {},
        },
      })
    }
  }

  console.log(`Seeded ${LANDING_TEMPLATES.length} landing templates`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
