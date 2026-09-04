import { retiredEndpoint } from '@/server/api/context'

/**
 * `GET|POST /api/v1/products` — retired.
 *
 * These endpoints existed so a merchant could push their catalogue into NCOM's
 * database and keep it in step from then on. NCOM no longer has a catalogue to
 * push into: products, prices, photos and stock are read from the merchant's
 * own website on every request that needs them.
 *
 * The direction of the arrow reversed, which is the whole change. Instead of
 * writing an importer that calls us, a merchant implements a small read
 * endpoint that we call — see /docs and docs/product-source.md. That is less
 * code on their side than the importer this replaced, and there is no longer a
 * second copy of the catalogue to drift out of date.
 *
 * 410 rather than 404 on purpose: this path existed, the caller is not
 * mistaken, and "gone" plus a sentence about where it went is the difference
 * between an integrator reading the migration note and one filing a bug about
 * our routing.
 */
const gone = retiredEndpoint(
  'NCOM no longer stores products. Instead of pushing your catalogue here, expose the connector endpoints on your own site and we will read them live.'
)

export const GET = gone
export const POST = gone
export const PUT = gone
export const PATCH = gone
export const DELETE = gone

export const runtime = 'nodejs'
