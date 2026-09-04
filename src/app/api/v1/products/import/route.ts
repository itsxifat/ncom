import { retiredEndpoint } from '@/server/api/context'

/**
 * `POST /api/v1/products/import` — retired.
 *
 * The bulk importer. Nothing to import into: see ../route.ts.
 *
 * Worth saying plainly to whoever finds this while their nightly sync is
 * failing — the sync is not needed any more, and switching it off is the
 * migration. Point NCOM at the endpoints described in /docs and the catalogue
 * is current by construction rather than by cron.
 */
const gone = retiredEndpoint(
  'Catalogue imports are retired. NCOM reads products from your website live — switch the sync off and connect a product source under Settings → Product source.'
)

export const POST = gone
export const GET = gone

export const runtime = 'nodejs'
