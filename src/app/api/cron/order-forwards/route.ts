import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { retryPendingForwards } from '@/server/orders'

/**
 * Scheduled sweep that retries order handoffs whose backoff has elapsed.
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

  const attempted = await retryPendingForwards()
  return NextResponse.json({ attempted })
}

export async function POST(request: NextRequest) {
  return run(request)
}

/** GET behaves identically, for schedulers that can only issue one. */
export async function GET(request: NextRequest) {
  return run(request)
}

export const runtime = 'nodejs'
