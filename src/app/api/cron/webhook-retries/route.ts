import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { retryPendingDeliveries } from '@/server/services/webhookService'
import { retryPendingForwards } from '@/server/orders'

/**
 * Scheduled sweep that retries webhook deliveries whose backoff has elapsed.
 *
 * The first attempt at a delivery happens inline, right after the response that
 * triggered it. Retries cannot: the request that caused the event is long gone
 * by the time the second attempt is due, and holding a serverless invocation
 * open for two hours to make one is not a plan. So the retry schedule lives in
 * the database — `WebhookDelivery.nextAttemptAt` — and this route drains what
 * is due.
 *
 * Run it about every minute:
 *
 *   * * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                https://app.example.com/api/cron/webhook-retries
 *
 * Without it, a delivery that fails its first attempt is never retried — the
 * rows accumulate as PENDING and the merchant's other system silently drifts
 * out of step. Same shared-secret authorisation as the other cron routes: this
 * one causes outbound HTTP to merchant-supplied URLs, so an open endpoint would
 * be a way to make the platform generate traffic on demand.
 *
 * It also drains the order handoff queue, which has the same shape and the same
 * schedule. Deliberately the same route rather than a second one: this is the
 * job that has to be installed in a crontab on a box somebody administers by
 * hand, and a feature whose reliability depends on an operator remembering to
 * add a second line is a feature that is reliable on the machines where they
 * did. The stakes are not the same, though — a missed webhook is a
 * notification, a missed handoff is a sale nobody is packing — so the two are
 * swept independently and one failing cannot stop the other.
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

  const [webhooks, forwards] = await Promise.allSettled([
    retryPendingDeliveries(),
    retryPendingForwards(),
  ])

  return NextResponse.json({
    // `attempted` keeps its old meaning and its old name: something may already
    // be reading it.
    attempted: settled(webhooks),
    orderForwards: settled(forwards),
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
  console.error('[cron] retry sweep failed', result.reason)
  return null
}

export const runtime = 'nodejs'
