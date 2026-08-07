import bcrypt from 'bcryptjs'
import { prisma } from '../src/server/db/client'
import { sectionRegistry } from '../src/modules/sections/registry'
import { BCRYPT_COST } from '../src/lib/security'

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@ncom.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'NCOM Admin',
      passwordHash: await bcrypt.hash(adminPassword, BCRYPT_COST),
      platformRole: 'SUPER_ADMIN',
    },
  })
  console.log(`Seeded SUPER_ADMIN: ${admin.email}`)

  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo Workspace', slug: 'demo' },
  })

  await prisma.membership.upsert({
    where: {
      userId_organizationId: { userId: admin.id, organizationId: demoOrg.id },
    },
    update: {},
    create: { userId: admin.id, organizationId: demoOrg.id, role: 'OWNER' },
  })
  console.log(`Seeded demo organization: ${demoOrg.slug}`)

  const categories = [
    { name: 'Business', slug: 'business', sortOrder: 1 },
    { name: 'Portfolio', slug: 'portfolio', sortOrder: 2 },
    { name: 'SaaS', slug: 'saas', sortOrder: 3 },
    { name: 'Event', slug: 'event', sortOrder: 4 },
    { name: 'Personal', slug: 'personal', sortOrder: 5 },
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

  await seedDemoPage(demoOrg.id)
}

/**
 * A demo project with real, populated sections — lets Phase 4's renderers
 * be verified visually end-to-end before the visual builder (Phase 5)
 * exists to author pages interactively.
 */
async function seedDemoPage(organizationId: string) {
  const componentDefinitions = await prisma.componentDefinition.findMany()
  const byKey = new Map(componentDefinitions.map((c) => [c.key, c]))

  const project = await prisma.project.upsert({
    where: { subdomain: 'demo-showcase' },
    update: {},
    create: {
      organizationId,
      name: 'Demo Showcase',
      subdomain: 'demo-showcase',
      theme: {
        create: {
          primaryColor: '#0e6b4f',
          secondaryColor: '#d3872a',
          backgroundColor: '#ffffff',
          textColor: '#17140f',
          headingFont: 'Fraunces',
          bodyFont: 'Inter',
          buttonStyle: 'SOLID',
          borderRadius: 'md',
          spacingScale: 'comfortable',
          containerWidth: '1200px',
        },
      },
    },
  })

  const existingSections = await prisma.pageSection.count({
    where: { page: { projectId: project.id } },
  })
  if (existingSections > 0) {
    console.log('Demo page already has sections, skipping')
    return
  }

  const page = await prisma.page.upsert({
    where: { projectId_slug: { projectId: project.id, slug: 'home' } },
    update: {},
    create: {
      projectId: project.id,
      title: 'Home',
      slug: 'home',
      isHome: true,
    },
  })

  const sectionsToSeed: Array<{
    key: string
    content: object
  }> = [
    {
      key: 'navbar',
      content: {
        logoText: 'Acme',
        links: [
          { label: 'Product', href: '#' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'FAQ', href: '#faq' },
        ],
        ctaLabel: 'Sign up',
        ctaHref: '#',
      },
    },
    {
      key: 'hero',
      content: {
        eyebrow: 'Now in public beta',
        headline: 'Ship a landing page your customers actually believe',
        subheadline:
          'Acme helps small teams launch a polished marketing site in an afternoon, not a sprint.',
        primaryCtaLabel: 'Start free',
        primaryCtaHref: '#',
        secondaryCtaLabel: 'Watch demo',
        secondaryCtaHref: '#',
      },
    },
    {
      key: 'features',
      content: {
        eyebrow: 'Why Acme',
        heading: 'Everything a launch needs',
        items: [
          {
            title: 'Fast setup',
            description: 'Go from blank page to published in minutes.',
          },
          {
            title: 'On-brand',
            description: 'Every section respects your colors and type.',
          },
          {
            title: 'No lock-in',
            description: 'Export your content whenever you want.',
          },
        ],
      },
    },
    {
      key: 'testimonials',
      content: {
        heading: 'Loved by early customers',
        items: [
          {
            quote:
              'We replaced a $4,000 agency quote with an afternoon of clicking around.',
            authorName: 'Sam Rivera',
            authorRole: 'Founder, Northwind',
          },
        ],
      },
    },
    {
      key: 'pricing',
      content: {
        eyebrow: 'Pricing',
        heading: 'Simple, transparent pricing',
        plans: [
          {
            name: 'Starter',
            price: '$0',
            period: '/mo',
            features: ['1 project', 'Basic sections', 'NCOM subdomain'],
            ctaLabel: 'Get started',
            ctaHref: '#',
            highlighted: false,
          },
          {
            name: 'Pro',
            price: '$29',
            period: '/mo',
            features: ['Unlimited projects', 'All sections', 'Custom domain'],
            ctaLabel: 'Get started',
            ctaHref: '#',
            highlighted: true,
          },
        ],
      },
    },
    {
      key: 'faq',
      content: {
        heading: 'Frequently asked questions',
        items: [
          {
            question: 'Do I need to know how to code?',
            answer: 'No — every section is edited visually.',
          },
          {
            question: 'Can I bring my own domain?',
            answer: 'Custom domains are supported on the Pro plan.',
          },
        ],
      },
    },
    {
      key: 'cta',
      content: {
        heading: 'Ready to launch?',
        subheading: 'Join today — no credit card required.',
        ctaLabel: 'Start free',
        ctaHref: '#',
      },
    },
    {
      key: 'footer',
      content: {
        logoText: 'Acme',
        columns: [
          {
            title: 'Product',
            links: [
              { label: 'Features', href: '#' },
              { label: 'Pricing', href: '#' },
            ],
          },
        ],
        bottomText: `© ${new Date().getFullYear()} Acme, Inc.`,
      },
    },
  ]

  for (const [order, entry] of sectionsToSeed.entries()) {
    const componentDefinition = byKey.get(entry.key)
    if (!componentDefinition) continue

    await prisma.pageSection.create({
      data: {
        pageId: page.id,
        componentDefinitionId: componentDefinition.id,
        order,
        content: entry.content,
        config: {},
      },
    })
  }

  console.log(`Seeded demo page with ${sectionsToSeed.length} sections`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
