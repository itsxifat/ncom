import { NextResponse, type NextRequest } from 'next/server'
import {
  parseSteadfastEvent,
  readBearer,
  resolveWebhookTarget,
  secretMatches,
} from '@/server/courier/inbound'
import { ingestCourierEvent } from '@/server/services/courierService'

/**
 * Steadfast delivery and tracking callbacks.
 *
 * URL shape: `/api/courier/steadfast/<webhookToken>`, where the token is the
 * per-organisation value shown in courier settings. Steadfast sends no tenant
 * identifier, so the URL is what routes the event to the right merchant.
 *
 * Optionally protected by a bearer token, which is the only authentication
 * their webhook offers — there is no body signature to verify. When the
 * merchant has configured one, it must match; when they have not, the
 * unguessable token in the path is the credential.
 *
 * Always answers 200 once the request is authentic, including for parcels this
 * workspace does not recognise. Steadfast retries on anything else, and
 * retrying an event that will never match is a queue that never drains.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const target = await resolveWebhookTarget('STEADFAST', token)
  if (!target) {
    // Deliberately indistinguishable from a rejected secret: a caller probing
    // tokens learns nothing about which ones exist.
    return NextResponse.json(
      { status: 'error', message: 'Unknown endpoint' },
      { status: 404 }
    )
  }

  if (
    !secretMatches(
      target.secret,
      readBearer(request.headers.get('authorization'))
    )
  ) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Body was not JSON' },
      { status: 400 }
    )
  }

  const parsed = parseSteadfastEvent(payload)
  if (!parsed) {
    // A payload naming no parcel — a probe, or a shape we do not handle. 200,
    // because a retry produces the same result.
    return NextResponse.json({
      status: 'success',
      message: 'Ignored: no consignment in payload.',
    })
  }

  try {
    const result = await ingestCourierEvent(
      target.organizationId,
      'STEADFAST',
      parsed,
      payload
    )

    return NextResponse.json({
      status: 'success',
      message: result.handled
        ? 'Webhook received successfully.'
        : (result.reason ?? 'Ignored.'),
    })
  } catch (cause) {
    console.error('[courier] steadfast webhook failed', cause)
    // A 500 is honest here and asks Steadfast to retry, which is what we want
    // for a transient database failure.
    return NextResponse.json(
      { status: 'error', message: 'Could not process the update' },
      { status: 500 }
    )
  }
}

/** A browser-visible health check, so a merchant can confirm the URL is live. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const target = await resolveWebhookTarget('STEADFAST', token)

  return target
    ? NextResponse.json({ status: 'success', message: 'Endpoint is live.' })
    : NextResponse.json(
        { status: 'error', message: 'Unknown endpoint' },
        { status: 404 }
      )
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
