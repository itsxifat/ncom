import { retiredEndpoint } from '@/server/api/context'

/** `GET|PATCH|DELETE /api/v1/categories/{id}` — retired. See ../route.ts. */
const gone = retiredEndpoint(
  'NCOM no longer stores categories. Your website is the source of truth for this one.'
)

export const GET = gone
export const PATCH = gone
export const PUT = gone
export const DELETE = gone

export const runtime = 'nodejs'
