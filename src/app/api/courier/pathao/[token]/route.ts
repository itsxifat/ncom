import { NextResponse, type NextRequest } from 'next/server'
import {
  PATHAO_INTEGRATION_HEADER,
  PATHAO_INTEGRATION_SECRET,
  parsePathaoEvent,
  resolveWebhookTarget,
  secretMatches,
} from '@/server/courier/inbound'
import { ingestCourierEvent } from '@/server/services/courierService'

/**
 * Pathao order lifecycle callbacks.
 *
 * URL shape: `/api/courier/pathao/<webhookToken>`. Pathao sends the merchant's
 * own secret back in `X-PATHAO-Signature`, which is compared in constant time
 * against the stored value.
 *
 * Pathao's delivery contract is unusually specific and every clause is load
 * bearing:
 *
 *   The response must carry `X-Pathao-Merchant-Webhook-Integration-Secret` with
 *   their published constant. A response without it is treated as a failed
 *   delivery and retried — which looks exactly like a working integration that
 *   quietly receives every event several times.
 *
 *   The status must be 202, not 200. Their docs are explicit, and 200 is
 *   counted as a failure.
 *
 *   The response must arrive within 10 seconds, through at most 3 redirects.
 *   Every path below answers immediately for that reason.
 *
 * Because the header is required on *every* response including rejections, it
 * is attached by one helper rather than remembered at each return.
 */

function reply(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { [PATHAO_INTEGRATION_HEADER]: PATHAO_INTEGRATION_SECRET },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const target = await resolveWebhookTarget('PATHAO', token)
  if (!target) {
    return reply({ message: 'Unknown endpoint' }, 404)
  }

  if (
    !secretMatches(target.secret, request.headers.get('x-pathao-signature'))
  ) {
    return reply({ message: 'Unauthorized' }, 401)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return reply({ message: 'Body was not JSON' }, 400)
  }

  const parsed = parsePathaoEvent(payload)

  // The integration handshake Pathao sends when the merchant saves the URL, and
  // store-level events that name no parcel. Both need the header and a 202 and
  // nothing else — parsePathaoEvent returns null for exactly these.
  if (!parsed) {
    return reply({ message: 'Accepted' }, 202)
  }

  try {
    const result = await ingestCourierEvent(
      target.organizationId,
      'PATHAO',
      parsed,
      payload
    )

    return reply(
      { message: result.handled ? 'Accepted' : (result.reason ?? 'Ignored') },
      202
    )
  } catch (cause) {
    console.error('[courier] pathao webhook failed', cause)
    // 500 asks Pathao to retry, which is right for a transient failure — and
    // the header still goes out, because their delivery system reads it before
    // it reads the status.
    return reply({ message: 'Could not process the update' }, 500)
  }
}

/** A browser-visible health check, so a merchant can confirm the URL is live. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const target = await resolveWebhookTarget('PATHAO', token)

  return target
    ? reply({ message: 'Endpoint is live.' }, 200)
    : reply({ message: 'Unknown endpoint' }, 404)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
