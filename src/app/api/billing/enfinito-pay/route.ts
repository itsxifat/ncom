import { NextResponse } from 'next/server'
import {
  EnfinitoPayError,
  verifyWebhookSignature,
} from '@/server/billing/enfinitoPay'
import { getEnfinitoPayCredentials } from '@/server/services/enfinitoPaySettingsService'
import { confirmPayment } from '@/server/services/billingPaymentService'

/**
 * `POST /api/billing/enfinito-pay` — Enfinito Pay's webhook for NCOM's own
 * billing (plans and AI credits). Set as the product's webhook URL in the
 * Enfinito Pay admin; Admin → Payments shows it.
 *
 * The body is checked against `Enfinito-Signature` before anything is read
 * from it, and even then it is only a prompt: `confirmPayment` fetches the
 * checkout from Enfinito Pay and decides from that. Events can arrive more
 * than once and out of order, which confirming is built to take.
 *
 * Answers 2xx for anything authentic it has dealt with — including events it
 * has no use for — because Enfinito Pay retries everything else for a day.
 * A failure that a retry could fix (Enfinito Pay or the database briefly
 * unreachable) answers 5xx so that it does.
 */

const HANDLED = new Set(['payment.succeeded', 'payment.refunded'])

export async function POST(request: Request) {
  const credentials = await getEnfinitoPayCredentials()
  if (!credentials?.webhookSecret) {
    // Not set up yet: a retry later, once it is, gets through.
    return NextResponse.json(
      { error: 'Webhooks are not set up' },
      { status: 503 }
    )
  }

  const raw = await request.text()
  if (
    !verifyWebhookSignature(
      raw,
      request.headers.get('enfinito-signature'),
      credentials.webhookSecret
    )
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: { id?: unknown; type?: unknown; data?: { id?: unknown } }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Body was not JSON' }, { status: 400 })
  }
  const type = typeof event.type === 'string' ? event.type : ''
  const checkoutId = typeof event.data?.id === 'string' ? event.data.id : ''
  if (!HANDLED.has(type) || !checkoutId) {
    // A failed attempt, an expiry or a cancellation changes nothing here: the
    // order stays waiting and the owner can pay it again.
    return NextResponse.json({ received: true })
  }

  try {
    const result = await confirmPayment(checkoutId)
    return NextResponse.json({ received: true, outcome: result.outcome })
  } catch (cause) {
    console.error('[billing] webhook could not be processed', {
      event: event.id,
      type,
      cause,
    })
    const retryable =
      !(cause instanceof EnfinitoPayError) ||
      cause.status === 0 ||
      cause.status >= 500 ||
      cause.status === 429
    return NextResponse.json(
      { error: 'Could not process the event' },
      { status: retryable ? 503 : 422 }
    )
  }
}
