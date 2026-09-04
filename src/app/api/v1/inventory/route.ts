import { retiredEndpoint } from '@/server/api/context'

/**
 * `GET|POST /api/v1/inventory` — retired.
 *
 * Two-way stock sync: we held a count, merchants pushed corrections to it, and
 * both sides tried to stay honest about the same number. That problem is gone
 * along with the second copy of the number. Stock is read from the merchant's
 * site when a shopper looks at a product and again when they check out, and
 * where their connector implements `/reserve`, that is where the units are
 * held.
 */
const gone = retiredEndpoint(
  'NCOM no longer stores stock. Your website holds the counts and we read them live; implement the /stock endpoint of the connector contract instead of pushing adjustments here.'
)

export const GET = gone
export const POST = gone

export const runtime = 'nodejs'
