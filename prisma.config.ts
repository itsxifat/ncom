import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Next.js auto-loads .env.local; the standalone Prisma CLI needs this explicitly
// so both share a single env file instead of drifting out of sync.
config({ path: '.env.local' })

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
