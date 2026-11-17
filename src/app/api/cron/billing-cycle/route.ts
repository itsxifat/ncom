import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runBillingCycle } from '@/server/services/billingCycleService'

/**
 * The billing clock: raises bills before periods end, chases them once due,
 * and records the lock after the grace day (see billingCycleService).
 *
 *   * /10 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                    https://ncom.bd/api/cron/billing-cycle
 *
 * Every ten minutes is plenty: the lock itself is worked out from the dates on
 * every request, so this only decides when bills and emails go out.
 *
 * Authorised by the shared cron secret, compared in constant time, and closed
 * when none is set — it raises invoices and emails every owner on the
 * platform, which no one outside should be able to set off.
 */

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : header

  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runBillingCycle())
}

/** Some schedulers can only GET. Safe: every step is idempotent. */
export async function GET(request: NextRequest) {
  return POST(request)
}
