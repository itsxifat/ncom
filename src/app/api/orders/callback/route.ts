import { NextResponse } from 'next/server'
import {
  applyInboundChange,
  authenticateCallback,
} from '@/server/orders/inbound'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * Changes reported back by the website that is processing a merchant's orders.
 *
 * The return leg of the order handoff. A merchant whose staff cancel an order
 * in their own admin has changed a record NCOM also holds, and without this
 * NCOM's copy would go on saying the order is live — with its units still off
 * the shelf for the products NCOM stores.
 *
 *   POST /api/orders/callback
 *   X-NCOM-Key:       ncomord_…          the order-destination key id
 *   X-NCOM-Signature: t=…,v1=…           over "<timestamp>.<raw body>"
 *
 * Deliberately public and unauthenticated by session — the caller is a server,
 * not a person — so the defences are all here:
 *
 *   The signature is the credential. The URL is not a secret and the key id is
 *   not either; only the HMAC proves the caller holds the shared secret, and
 *   the timestamp inside it stops a captured request being replayed later.
 *
 *   The credential names the organisation. Every lookup inside is scoped to it,
 *   so a merchant's key cannot see, name or change another workspace's order.
 *
 *   Rate limited per key. A signed endpoint is not a free endpoint: a receiver
 *   stuck in a retry loop must not be able to spend the platform's database.
 *
 *   Nothing is created. This can only change orders NCOM itself handed to that
 *   organisation's endpoint, which is why it needs no ORDERS_WRITE scope and is
 *   not reachable with an ordinary API key.
 */

/** Generous — a busy shop syncing a morning's edits is normal traffic. */
const LIMIT = 120
const WINDOW_SECONDS = 60

/** A signed body larger than this is not an order. */
const MAX_BODY_BYTES = 512 * 1024

export async function POST(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  // Raw text, not `request.json()` — re-serialising changes the bytes and the
  // signature would never match. Read before anything can consume the body.
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const keyId = request.headers.get('x-ncom-key')

  // Keyed on the credential rather than the address: the caller is a server
  // whose IP is shared with everything else on its host, and the key is the
  // thing we are actually willing to meter. Falls back to the IP for a caller
  // that sent no key, which is refused a line later anyway.
  const bucket = keyId ?? (await getClientIp())
  const limit = await checkRateLimit(
    `order-callback:${bucket}`,
    LIMIT,
    WINDOW_SECONDS
  )
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) },
      }
    )
  }

  const caller = await authenticateCallback(
    keyId,
    request.headers.get('x-ncom-signature'),
    rawBody
  )
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message: unknown
  try {
    message = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await applyInboundChange(
    caller.organizationId,
    message as Parameters<typeof applyInboundChange>[1]
  )

  if (!result.ok) {
    // A 409 carries NCOM's own revision, which is what lets the caller see
    // *how* the two sides diverged rather than only that they did.
    return NextResponse.json(
      { error: result.error, revision: result.revision },
      { status: result.status }
    )
  }

  return NextResponse.json({
    ok: true,
    revision: result.revision,
    ...(result.deduped ? { deduped: true } : {}),
  })
}

export const runtime = 'nodejs'
