import { NextResponse, type NextRequest } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  confirmPayment,
  paidUrl,
} from '@/server/services/billingPaymentService'

/**
 * `GET /billing/payment/return?session_id=cs_…` — where Enfinito Pay sends
 * the owner after they pay.
 *
 * Landing here proves nothing (anyone can open the address), so the checkout
 * is fetched from Enfinito Pay and applied if it is paid — the same check the
 * webhook makes. Doing it here as well means the plan is on when the owner
 * sees the billing page, rather than a moment after, whenever the webhook
 * lands. Signed-in only, like the rest of /billing.
 */
export async function GET(request: NextRequest) {
  const { organization } = await getActiveOrganization()
  const back = (path: string) =>
    NextResponse.redirect(new URL(path, request.url))

  const sessionId = request.nextUrl.searchParams.get('session_id') ?? ''
  if (!/^cs_[A-Za-z0-9_-]{1,120}$/.test(sessionId)) return back('/billing')

  const limit = await checkRateLimit(
    `billing-return:${organization.id}`,
    30,
    60
  )
  if (!limit.allowed) return back('/billing?payment=processing')

  let outcome
  try {
    outcome = await confirmPayment(sessionId)
  } catch (cause) {
    // The webhook will settle it; the owner is told it is on its way.
    console.error('[billing] confirming a payment on return failed', cause)
    return back('/billing?payment=processing')
  }

  if (outcome.outcome === 'ignored') return back('/billing')
  if (outcome.outcome === 'paid') return back(paidUrl(outcome.kind))
  if (outcome.outcome === 'failed') return back('/billing?payment=failed')
  if (outcome.outcome === 'closed') return back('/billing?payment=cancelled')
  return back('/billing?payment=processing')
}
