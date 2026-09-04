import { retiredEndpoint } from '@/server/api/context'

/**
 * `GET|PATCH|DELETE /api/v1/products/{id}` — retired.
 *
 * See the note in ../route.ts: the catalogue is read from the merchant's own
 * website now, so there is no row here to read, edit or delete.
 */
const gone = retiredEndpoint(
  'NCOM no longer stores products. Your website is the source of truth for this product — edit it there, and every landing page follows on the next request.'
)

export const GET = gone
export const PATCH = gone
export const PUT = gone
export const DELETE = gone

export const runtime = 'nodejs'
