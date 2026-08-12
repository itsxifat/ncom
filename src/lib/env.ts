import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().min(1),

  ROOT_DOMAIN: z.string().min(1),

  // EnCDN — the media CDN every upload is stored on and served from.
  CDN_BASE_URL: z.url(),
  CDN_API_KEY: z.string().min(1),
  CDN_API_SECRET: z.string().min(1),
  // Normally read out of the `publicUrl` EnCDN returns on upload; only set
  // this to override that.
  CDN_CLIENT_ID: z.string().min(1).optional(),
  CDN_SIGNED_URLS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  REDIS_URL: z.string().min(1),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error(
      'Invalid environment variables:',
      z.treeifyError(parsed.error)
    )
    throw new Error('Invalid environment variables — see .env.example')
  }

  return parsed.data
}

export const env = loadEnv()
