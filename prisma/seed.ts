import bcrypt from 'bcryptjs'
import { prisma } from '../src/server/db/client'

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@ncom.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'NCOM Admin',
      passwordHash: await bcrypt.hash(adminPassword, 10),
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

  // ComponentDefinition rows (navbar, hero, text, ...) are seeded in Phase 4
  // once modules/sections/registry.ts exists — their `key` must match it.
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
