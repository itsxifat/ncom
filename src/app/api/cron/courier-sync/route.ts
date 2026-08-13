import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import {
  runDueDispatches,
  syncStaleShipments,
} from '@/server/services/courierService'

/**
 * Scheduled courier sweep. Two jobs, one invocation.
 *
 * `runDueDispatches` sends orders whose dispatch is now due — those held back
 * by the merchant's dispatch delay, and those whose courier call failed and
 * whose backoff has elapsed. Without it, an order approved with a 30-minute
 * delay never ships, and a dispatch that failed on a courier's bad afternoon
 * stays failed.
 *
 * `syncStaleShipments` polls couriers about parcels that have gone quiet.
 * Webhooks are the primary channel, but a dropped webhook is invisible: nothing
 * fails, nothing logs, the parcel simply stops updating and nobody notices
 * until the customer asks. Asking directly is the only way to close that gap,
 * so this is not optional infrastructure — without it the tracking a merchant
 * shows their customers is only as reliable as someone else's retry queue.
 *
 * Run it every five minutes:
 *
 *   *\/5 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                  https://app.example.com/api/cron/courier-sync
 *
 * Same shared-secret authorisation as the other cron routes. This one causes
 * outbound calls to courier APIs under merchant credentials and can create real
 * parcels, so an open endpoint would be a way to spend a merchant's money.
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

  // Dispatches first: a parcel created in this run should not then be polled in
  // the same run, and a courier that has just been told about a consignment has
  // nothing new to report about it.
  const dispatched = await runDueDispatches()
  const synced = await syncStaleShipments()

  return NextResponse.json({ dispatched, synced })
}

export async function POST(request: NextRequest) {
  return run(request)
}

/** GET behaves identically, for schedulers that can only issue one. */
export async function GET(request: NextRequest) {
  return run(request)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
