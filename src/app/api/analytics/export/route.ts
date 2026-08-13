import { type NextRequest } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import {
  getSalesAnalytics,
  seriesToCsv,
} from '@/server/services/salesAnalyticsService'
import { resolveRange } from '@/lib/date-range'
import { minorUnitsPerMajor } from '@/lib/money'

/**
 * The analytics series as a CSV download.
 *
 * A route rather than a server action because the browser has to receive it as
 * a file: an action returns a value into a React tree, and turning that into a
 * download means building a blob client-side and losing the filename.
 *
 * Authorised through the same path as the page — `getActiveOrganization` plus
 * the role check inside `getSalesAnalytics` — so a link shared out of the
 * dashboard cannot be opened by someone without access to the order book.
 *
 * Money is written in major units with two decimals, because this file is
 * opened in a spreadsheet by a person, not parsed by a program. Cents would be
 * more faithful and would have every accountant dividing by 100 by hand.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const range = params.get('range') ?? 'last_30_days'
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  const { organization } = await getActiveOrganization()
  const window = resolveRange({ range, from, to })

  const [analytics, settings] = await Promise.all([
    getSalesAnalytics(organization.id, window),
    getOrganizationSettings(organization.id),
  ])

  const currency = settings?.currencyCode ?? 'BDT'

  const csv = seriesToCsv(
    analytics.series,
    analytics.granularity,
    currency,
    minorUnitsPerMajor(currency)
  )

  // The window is in the filename so a folder of these stays sortable and a
  // merchant can tell two exports apart a month later.
  const stamp = window.start
    ? `${window.start.toISOString().slice(0, 10)}_${new Date(window.end.getTime() - 1).toISOString().slice(0, 10)}`
    : 'all-time'

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sales-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
