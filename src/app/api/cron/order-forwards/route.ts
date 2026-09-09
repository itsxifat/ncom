import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { retryPendingForwards, retryPendingSyncs } from '@/server/orders'

/**
 * Scheduled sweep that retries order handoffs, and the changes that follow
 * them, whose backoff has elapsed.
 *
 * The first attempt at handing an order to a merchant's website happens inline,
 * right after the response that created it. Every attempt after that has to
 * come from here: the request that took the order is long gone by the time the
 * second attempt is due, and holding an invocation open for six hours to make
 * one is not a plan.
 *
 * **This is not optional.** Without it a handoff that fails its first attempt is
 * never retried, and an order that exists here and does not exist on the
 * merchant's website is a sale nobody is packing. Install it wherever the app
 * runs, about every minute:
 *
 *   * * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                https://app.example.com/api/cron/order-forwards
 *
 * Deliberately its own route rather than a second sweep inside
 * `webhook-retries`, even though the two have the same shape and the same
 * schedule. Sharing one looked tidier until the first box this shipped to
 * turned out to have never installed the webhook cron at all, with 630
 * deliveries queued back to August — so switching the shared route on would
 * have replayed a month of stale product and stock events at merchants as a
 * side effect of enabling order retries. Two jobs can be enabled
 * independently; one cannot.
 *
 * Same shared-secret authorisation as the other cron routes: this causes
 * outbound HTTP to merchant-supplied URLs, so an open endpoint would be a way
 * to make the platform generate traffic on demand.
 */

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

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Handoffs first, then the changes that follow them. A change to an order
  // whose original handoff has not landed would be refused for an unknown
  // order, and draining the two in this order means the common case — a site
  // that was briefly down — heals in one sweep instead of two.
  //
  // Settled independently so one throwing cannot stop the other.
  const [placed, changed] = await Promise.allSettled([
    retryPendingForwards(),
    retryPendingSyncs(),
  ])

  return NextResponse.json({
    attempted: settled(placed),
    changes: settled(changed),
  })
}

export async function POST(request: NextRequest) {
  return run(request)
}

/** GET behaves identically, for schedulers that can only issue one. */
export async function GET(request: NextRequest) {
  return run(request)
}

/** A sweep that threw is reported as null rather than failing the whole run. */
function settled(result: PromiseSettledResult<number>): number | null {
  if (result.status === 'fulfilled') return result.value
  console.error('[cron] order sweep failed', result.reason)
  return null
}

export const runtime = 'nodejs'
