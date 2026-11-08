import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Enfinito Pay (pay.enfinito.com) — the one way NCOM takes money from its own
 * workspaces: plans, add-ons and AI credit packs.
 *
 * NCOM never talks to a payment gateway. It creates a checkout here with the
 * order and its price in BDT, sends the owner to the checkout's page, and
 * learns the result two ways that both end in `retrieveCheckout`: the owner
 * coming back to the success URL, and a signed webhook. A visit to the success
 * URL proves nothing on its own — anyone can open it — so nothing is granted
 * until this API says the checkout is paid.
 *
 * Shoppers paying a merchant's store never come through here: each store
 * brings its own payment methods (paymentService).
 *
 * Money is in taka with up to two decimals at this boundary and in paisa
 * everywhere inside NCOM, so every amount crossing it is converted here.
 */

/** Overridable so a test can point NCOM at a stand-in; production uses the real one. */
function apiBase(): string {
  return (
    process.env.ENFINITO_PAY_API_URL?.trim().replace(/\/$/, '') ||
    'https://pay.enfinito.com/api/v1'
  )
}

/** How long a request may take before the owner is told to try again. */
const TIMEOUT_MS = 20_000

/** How old a webhook's signature may be, as the docs recommend. */
const SIGNATURE_TOLERANCE_SECONDS = 300

export type CheckoutStatus =
  | 'open'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'

export interface EnfinitoCheckout {
  id: string
  livemode: boolean
  status: CheckoutStatus
  reference: string
  currency: string
  /** Taka. */
  amount_total: number
  url: string
  expires_at: string
  payment?: {
    method?: string
    transaction_id?: string
    invoice_number?: string
    payer_mobile?: string
    paid_at?: string
  } | null
  metadata?: Record<string, string> | null
}

export interface CheckoutRequest {
  /** Our order number, at most 64 characters; the payer sees it. */
  reference: string
  /** Paisa. Sent as taka. */
  items: { name: string; amountCents: number; quantity?: number }[]
  discountCents?: number
  description?: string
  customer?: { name?: string; email?: string; phone?: string }
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

/** A refusal with the API's own code — `unauthorized`, `conflict`, … — or a transport failure. */
export class EnfinitoPayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message)
    this.name = 'EnfinitoPayError'
  }
}

export function toTaka(cents: number): number {
  return Math.round(cents) / 100
}

export function toCents(taka: number): number {
  return Math.round(taka * 100)
}

/** A secret key's mode, from its prefix: test keys move no real money. */
export function keyMode(secretKey: string): 'test' | 'live' {
  return secretKey.startsWith('sk_live_') ? 'live' : 'test'
}

async function request<T>(
  secretKey: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string }
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(init.idempotencyKey && { 'Idempotency-Key': init.idempotencyKey }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    throw new EnfinitoPayError(
      cause instanceof Error && cause.name === 'TimeoutError'
        ? 'Enfinito Pay took too long to answer.'
        : 'Enfinito Pay could not be reached.',
      0,
      'unreachable'
    )
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: { code?: string; message?: string } }) | null
  if (!response.ok || !body) {
    throw new EnfinitoPayError(
      body?.error?.message ?? `Enfinito Pay answered ${response.status}.`,
      response.status,
      body?.error?.code ?? 'unknown'
    )
  }
  return body
}

/**
 * Starts a checkout. The same `idempotencyKey` returns the same checkout, so a
 * double click or a retried request cannot open two.
 */
export function createCheckout(
  secretKey: string,
  input: CheckoutRequest,
  idempotencyKey: string
): Promise<EnfinitoCheckout> {
  return request<EnfinitoCheckout>(secretKey, '/checkout/sessions', {
    method: 'POST',
    idempotencyKey,
    body: {
      reference: input.reference.slice(0, 64),
      items: input.items.slice(0, 50).map((item) => ({
        name: item.name.slice(0, 200),
        amount: toTaka(item.amountCents),
        quantity: item.quantity ?? 1,
      })),
      ...(input.discountCents ? { discount: toTaka(input.discountCents) } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.customer && { customer: input.customer }),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.metadata && { metadata: input.metadata }),
    },
  })
}

export function retrieveCheckout(
  secretKey: string,
  id: string
): Promise<EnfinitoCheckout> {
  return request<EnfinitoCheckout>(
    secretKey,
    `/checkout/sessions/${encodeURIComponent(id)}`,
    { method: 'GET' }
  )
}

export function cancelCheckout(
  secretKey: string,
  id: string
): Promise<EnfinitoCheckout> {
  return request<EnfinitoCheckout>(
    secretKey,
    `/checkout/sessions/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' }
  )
}

/**
 * Whether a key is accepted, asked without making anything: a checkout that
 * does not exist answers 404 to a good key and 401 to a bad one.
 */
export async function checkSecretKey(
  secretKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await retrieveCheckout(secretKey, 'cs_ncom_key_check')
    return { ok: true }
  } catch (cause) {
    if (cause instanceof EnfinitoPayError) {
      if (cause.code === 'not_found' || cause.status === 404)
        return { ok: true }
      if (cause.status === 401)
        return {
          ok: false,
          error:
            'Enfinito Pay did not accept that key. Check it, or create a new one.',
        }
      if (cause.status === 403)
        return {
          ok: false,
          error: 'This product is paused in the Enfinito Pay admin.',
        }
      return { ok: false, error: cause.message }
    }
    throw cause
  }
}

/**
 * Checks a webhook's `Enfinito-Signature` header: `t=<unix seconds>,v1=<hex>`,
 * where v1 is the HMAC-SHA256 of `t + "." + raw body` keyed with the
 * webhook secret. Compared in constant time, and refused when the timestamp is
 * more than five minutes from now, so a captured request cannot be replayed
 * later.
 *
 * `rawBody` must be the body exactly as received — parsed and re-serialised
 * JSON is not the same bytes.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header) return false
  const parts = new Map<string, string>()
  for (const part of header.split(',')) {
    const at = part.indexOf('=')
    if (at > 0) parts.set(part.slice(0, at).trim(), part.slice(at + 1).trim())
  }
  const t = parts.get('t')
  const v1 = parts.get('v1')
  if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]+$/i.test(v1)) return false
  if (Math.abs(nowSeconds - Number(t)) > SIGNATURE_TOLERANCE_SECONDS)
    return false
  const expected = createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex')
  const given = Buffer.from(v1.toLowerCase(), 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}
