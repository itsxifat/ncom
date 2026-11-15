import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runCrmJob } from '@/server/billing/crmSync'

/**
 * The Enfinito CRM's clock: refreshes the tax settings the CRM decides,
 * pushes every invoice that changed (billing/crmSync.ts), and compares both
 * sides every six hours. Sales also push right after they change; this is
 * what retries whatever could not go then (the CRM away, a timeout).
 *
 * Install it wherever the app runs, about every minute:
 *
 *   * * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                https://app.example.com/api/cron/crm-sync
 *
 * Without CRM_BASE_URL and CRM_API_SECRET it does nothing.
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
  return NextResponse.json(await runCrmJob())
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
