import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runUsageAlerts } from '@/server/services/usageAlertService'

/**
 * Scheduled sweep that warns tenants approaching a plan limit.
 *
 * A route rather than an in-process timer: this app runs as more than one
 * instance, and a `setInterval` in module scope would fire once per instance and
 * send duplicate mail. A single scheduled request is the only shape that stays
 * correct as the deployment grows — and it works with whatever scheduler you
 * have (Vercel cron, a systemd timer, GitHub Actions, cron + curl).
 *
 *   0 9 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                https://app.example.com/api/cron/usage-alerts
 *
 * Authorised by a shared secret, compared in constant time. Without
 * `CRON_SECRET` set the route refuses every request rather than running
 * unauthenticated: it reads every organisation's usage and sends mail on their
 * behalf, so an open endpoint is both an information leak and a way to make the
 * platform send email to its own customers on demand.
 */

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : header

  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  // Length is compared first because timingSafeEqual throws on a mismatch. The
  // length of a secret is not the secret.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runUsageAlerts()
  return NextResponse.json(result)
}

/**
 * GET behaves identically, because several hosted schedulers can only issue a
 * GET. It is safe to expose as one: the sweep is idempotent within a month —
 * the Redis latch means a second run sends nothing.
 */
export async function GET(request: NextRequest) {
  return POST(request)
}
