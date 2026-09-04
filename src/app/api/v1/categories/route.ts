import { retiredEndpoint } from '@/server/api/context'

/**
 * `GET|POST /api/v1/categories` — retired.
 *
 * Categories came with the catalogue and left with it. A connector that
 * implements `/categories` has its tree read live; one that does not simply has
 * no tree, and nothing here needs one.
 */
const gone = retiredEndpoint(
  'NCOM no longer stores categories. Expose /categories on your connector and we will read your tree live.'
)

export const GET = gone
export const POST = gone

export const runtime = 'nodejs'
