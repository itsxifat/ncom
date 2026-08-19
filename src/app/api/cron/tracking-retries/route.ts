import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import {
  pruneTrackingDeliveries,
  retryPendingTrackingDeliveries,
} from '@/server/services/trackingService'

/**
 * Scheduled sweep that retries conversions whose backoff has elapsed.
 *
 * The first attempt happens inline, right after the order response. Retries
 * cannot: the request that made the sale is long gone by the time the second
 * attempt is due. So the schedule lives in the database —
 * `TrackingDelivery.nextAttemptAt` — and this route drains what is due.
 *
 * Run it about every minute, alongside the webhook sweep:
 *
 *   * * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                https://app.example.com/api/cron/tracking-retries
 *
 * Without it, a conversion that fails its first attempt — Meta rate-limiting a
 * busy campaign launch is the ordinary cause — is never sent again, and the
 * merchant's ad platform is quietly missing sales it should be optimising
 * towards. The whole retry schedule finishes inside 40 minutes, so a sweep that
 * stops running is noticed as missing conversions the same day.
 *
 * Same shared-secret authorisation as the other cron routes.
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

  const attempted = await retryPendingTrackingDeliveries()
  // Pruned in the same sweep rather than on its own schedule: the delivery log
  // now records every event, not only purchases, and without this it is the
  // fastest-growing table in the database.
  const pruned = await pruneTrackingDeliveries()
  return NextResponse.json({ attempted, pruned })
}

export async function POST(request: NextRequest) {
  return run(request)
}

/** GET behaves identically, for schedulers that can only issue one. */
export async function GET(request: NextRequest) {
  return run(request)
}

export const runtime = 'nodejs'
