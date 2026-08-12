import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// The standalone Prisma CLI does not read Next.js's env files, so load them here
// and keep the two in step. Both names are tried in the same precedence order
// Next uses — `.env.local` first, then `.env` — because dotenv keeps the first
// value it sees for a key. Loading only `.env.local` meant a production box that
// followed the usual `.env` convention had a working app but a Prisma CLI that
// could not see DATABASE_URL at all, which surfaces as the unhelpful
// "datasource.url property is required" during `migrate deploy`.
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
