import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().min(1),

  ROOT_DOMAIN: z.string().min(1),

  STORAGE_DRIVER: z.enum(['s3', 'local']),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

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

  if (parsed.data.STORAGE_DRIVER === 's3') {
    const required = [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_PUBLIC_URL',
    ] as const

    const missing = required.filter((key) => !parsed.data[key])
    if (missing.length > 0) {
      throw new Error(
        `STORAGE_DRIVER=s3 requires: ${missing.join(', ')} — see .env.example`
      )
    }
  }

  return parsed.data
}

export const env = loadEnv()
