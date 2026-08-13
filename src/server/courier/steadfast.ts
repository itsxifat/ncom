import 'server-only'
import { mapSteadfastStatus } from './statusMap'
import { requireBdPhone } from './phone'
import {
  COURIER_TIMEOUT_MS,
  CourierApiError,
  CourierNotConfiguredError,
  type CourierBalance,
  type CourierClient,
  type CourierConsignmentRequest,
  type CourierConsignmentResult,
  type CourierStatusResult,
} from './types'

/**
 * Steadfast Courier (Packzy) merchant API, V1.
 *
 * Authentication is two static headers, `Api-Key` and `Secret-Key`, on every
 * request — there is no token exchange and nothing to refresh, which makes this
 * the simpler of the two couriers by a wide margin.
 *
 * Two things about their API shape drive the code below:
 *
 *   Money is in whole taka, not paisa. Everything inside this platform is minor
 *   units, so every amount crossing this boundary is converted, and the
 *   conversion is in one place rather than at each call site.
 *
 *   HTTP 200 does not mean success. Their bulk endpoint returns a per-item
 *   `status: "error"` inside a 200 response, and validation failures come back
 *   as a 200 with a `status` field in the 400s. The response body is what
 *   decides, not the transport.
 */

const BASE_URL = 'https://portal.packzy.com/api/v1'

export interface SteadfastCredentials {
  apiKey: string
  secretKey: string
}

/** Steadfast talks in taka; this platform stores paisa. */
const MINOR_UNITS_PER_TAKA = 100

function toTaka(cents: number): number {
  return Math.round(cents) / MINOR_UNITS_PER_TAKA
}

function toCents(taka: number | string | null | undefined): number | null {
  if (taka == null) return null
  const value = typeof taka === 'string' ? Number(taka) : taka
  if (!Number.isFinite(value)) return null
  return Math.round(value * MINOR_UNITS_PER_TAKA)
}

interface SteadfastEnvelope {
  status?: number
  message?: string
  [key: string]: unknown
}

export class SteadfastClient implements CourierClient {
  readonly provider = 'STEADFAST' as const

  private readonly apiKey: string
  private readonly secretKey: string

  constructor(credentials: Partial<SteadfastCredentials> | null | undefined) {
    if (!credentials?.apiKey || !credentials.secretKey) {
      throw new CourierNotConfiguredError(
        'Steadfast needs both an API key and a secret key'
      )
    }
    this.apiKey = credentials.apiKey
    this.secretKey = credentials.secretKey
  }

  /**
   * One request, with the two failure modes Steadfast actually produces folded
   * into one error type: a transport failure, and a 200 whose body says no.
   */
  private async request<T extends SteadfastEnvelope>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' }
  ): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: init.method,
        headers: {
          'Api-Key': this.apiKey,
          'Secret-Key': this.secretKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(COURIER_TIMEOUT_MS),
        cache: 'no-store',
      })
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
      throw new CourierApiError(
        'STEADFAST',
        timedOut
          ? `Steadfast did not respond within ${COURIER_TIMEOUT_MS / 1000}s`
          : 'Could not reach Steadfast',
        // No response at all is the definition of worth-retrying: the request
        // may never have arrived, and the parcel certainly was not created.
        { retryable: true }
      )
    }

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // An HTML body from Steadfast means a login page or an error page, which
      // in practice means the keys are wrong or the portal is down.
      throw new CourierApiError(
        'STEADFAST',
        response.ok
          ? 'Steadfast returned a non-JSON response — check the API key and secret key'
          : `Steadfast responded ${response.status}`,
        { statusCode: response.status, body: text.slice(0, 500) }
      )
    }

    if (!response.ok) {
      throw new CourierApiError(
        'STEADFAST',
        readMessage(body) ?? `Steadfast responded ${response.status}`,
        {
          statusCode: response.status,
          body,
          // 401/422 will fail identically on a retry: the credentials or the
          // payload are wrong, and only a human changes either.
          retryable: response.status >= 500 || response.status === 429,
        }
      )
    }

    const envelope = (body ?? {}) as T

    // Their success envelope carries its own status code, and a validation
    // failure arrives as 200 with status 400 inside. Trusting the transport
    // here would record a consignment that does not exist.
    if (typeof envelope.status === 'number' && envelope.status >= 400) {
      throw new CourierApiError(
        'STEADFAST',
        readMessage(body) ??
          `Steadfast rejected the request (${envelope.status})`,
        {
          statusCode: envelope.status,
          body,
          retryable: envelope.status >= 500,
        }
      )
    }

    return envelope
  }

  async verify(): Promise<{ ok: true; detail: string }> {
    // The balance endpoint is the cheapest call that proves both headers are
    // accepted — a create call would prove it too, at the cost of a real parcel.
    const balance = await this.fetchBalance()
    return {
      ok: true,
      detail: `Connected. Current balance ৳${(balance.currentBalanceCents / MINOR_UNITS_PER_TAKA).toFixed(2)}.`,
    }
  }

  async fetchBalance(): Promise<CourierBalance> {
    const body = await this.request<
      SteadfastEnvelope & { current_balance?: number }
    >('/get_balance')

    return {
      currentBalanceCents: toCents(body.current_balance) ?? 0,
    }
  }

  async createConsignment(
    request: CourierConsignmentRequest
  ): Promise<CourierConsignmentResult> {
    // Validated here rather than at the courier, so a bad number produces a
    // message naming the field instead of a generic 422 two layers down.
    const recipientPhone = requireBdPhone(request.recipientPhone)

    const payload = {
      invoice: request.merchantOrderId,
      recipient_name: request.recipientName.slice(0, 100),
      recipient_phone: recipientPhone,
      ...(request.alternativePhone
        ? { alternative_phone: request.alternativePhone }
        : {}),
      ...(request.recipientEmail
        ? { recipient_email: request.recipientEmail }
        : {}),
      recipient_address: request.recipientAddress.slice(0, 250),
      cod_amount: toTaka(request.codAmountCents),
      ...(request.note ? { note: request.note.slice(0, 250) } : {}),
      ...(request.itemDescription
        ? { item_description: request.itemDescription.slice(0, 250) }
        : {}),
      ...(request.itemQuantity ? { total_lot: request.itemQuantity } : {}),
      // 0 = home delivery. The alternative is hub pickup, which is not what an
      // ecommerce order placed with a home address wants.
      delivery_type: 0,
    }

    const body = await this.request<
      SteadfastEnvelope & {
        consignment?: {
          consignment_id?: number
          tracking_code?: string
          status?: string
        }
      }
    >('/create_order', { method: 'POST', body: payload })

    const consignment = body.consignment
    if (!consignment?.consignment_id) {
      throw new CourierApiError(
        'STEADFAST',
        readMessage(body) ??
          'Steadfast accepted the request but returned no consignment',
        { body }
      )
    }

    const rawStatus = consignment.status ?? 'in_review'

    return {
      consignmentId: String(consignment.consignment_id),
      trackingCode: consignment.tracking_code ?? null,
      status: mapSteadfastStatus(rawStatus),
      rawStatus,
      // Steadfast does not quote a fee at creation; it appears on the payment
      // statement afterwards.
      deliveryFeeCents: null,
      raw: body,
    }
  }

  /**
   * Reads a parcel's status.
   *
   * Steadfast offers three lookups and they are not equally reliable: the
   * consignment id is theirs and always resolves, the tracking code is theirs
   * too, and the invoice is ours and only works if it was unique. They are
   * tried in that order of confidence.
   */
  async fetchStatus(reference: {
    consignmentId?: string | null
    merchantOrderId?: string | null
    trackingCode?: string | null
  }): Promise<CourierStatusResult | null> {
    const path = reference.consignmentId
      ? `/status_by_cid/${encodeURIComponent(reference.consignmentId)}`
      : reference.trackingCode
        ? `/status_by_trackingcode/${encodeURIComponent(reference.trackingCode)}`
        : reference.merchantOrderId
          ? `/status_by_invoice/${encodeURIComponent(reference.merchantOrderId)}`
          : null

    if (!path) return null

    const body = await this.request<
      SteadfastEnvelope & { delivery_status?: string }
    >(path)

    const rawStatus = body.delivery_status
    if (!rawStatus) return null

    return {
      status: mapSteadfastStatus(rawStatus),
      rawStatus,
      message: `Steadfast reports ${rawStatus.replace(/_/g, ' ')}`,
      // The status endpoint carries no timestamp, so the reading is stamped
      // with when we took it. Webhook events do carry one and use that instead.
      occurredAt: new Date(),
      raw: body,
    }
  }

  /**
   * Creates up to 500 consignments in one call.
   *
   * Returned per-item rather than as a single success: the endpoint reports
   * `status: "error"` on individual rows inside an otherwise fine response, and
   * a caller that treats the call as atomic will mark parcels dispatched that
   * were never created.
   */
  async createConsignmentsBulk(
    requests: CourierConsignmentRequest[]
  ): Promise<
    Array<
      | { ok: true; merchantOrderId: string; result: CourierConsignmentResult }
      | { ok: false; merchantOrderId: string; error: string }
    >
  > {
    if (requests.length === 0) return []
    if (requests.length > 500) {
      throw new CourierApiError(
        'STEADFAST',
        'Steadfast accepts at most 500 parcels per bulk call',
        { retryable: false }
      )
    }

    const data = requests.map((request) => ({
      invoice: request.merchantOrderId,
      recipient_name: request.recipientName.slice(0, 100),
      recipient_phone: requireBdPhone(request.recipientPhone),
      recipient_address: request.recipientAddress.slice(0, 250),
      cod_amount: toTaka(request.codAmountCents),
      note: request.note ?? null,
    }))

    // The endpoint wants the array JSON-encoded *into* a string field, not
    // nested as JSON. Sending it as a real array is silently accepted and
    // creates nothing.
    const body = await this.request<SteadfastEnvelope>(
      '/create_order/bulk-order',
      { method: 'POST', body: { data: JSON.stringify(data) } }
    )

    const rows = Array.isArray(body)
      ? (body as unknown[])
      : Array.isArray(body.data)
        ? (body.data as unknown[])
        : []

    return rows.map((row, index) => {
      const item = (row ?? {}) as Record<string, unknown>
      const merchantOrderId =
        typeof item.invoice === 'string'
          ? item.invoice
          : (requests[index]?.merchantOrderId ?? '')

      if (item.status !== 'success' || !item.consignment_id) {
        return {
          ok: false as const,
          merchantOrderId,
          error:
            typeof item.message === 'string'
              ? item.message
              : 'Steadfast rejected this parcel',
        }
      }

      return {
        ok: true as const,
        merchantOrderId,
        result: {
          consignmentId: String(item.consignment_id),
          trackingCode:
            typeof item.tracking_code === 'string' ? item.tracking_code : null,
          status: mapSteadfastStatus('in_review'),
          rawStatus: 'in_review',
          deliveryFeeCents: null,
          raw: item,
        },
      }
    })
  }

  /** Asks Steadfast to send a delivered parcel back. */
  async createReturnRequest(
    reference: { consignmentId?: string; merchantOrderId?: string },
    reason?: string
  ): Promise<{ id: string; status: string }> {
    const body = await this.request<
      SteadfastEnvelope & { id?: number | string; status?: string | number }
    >('/create_return_request', {
      method: 'POST',
      body: {
        ...(reference.consignmentId
          ? { consignment_id: reference.consignmentId }
          : { invoice: reference.merchantOrderId }),
        ...(reason ? { reason } : {}),
      },
    })

    return {
      id: String(body.id ?? ''),
      status: typeof body.status === 'string' ? body.status : 'pending',
    }
  }

  /** Delivery areas Steadfast serves, for address validation in the UI. */
  async listPoliceStations(): Promise<unknown> {
    return this.request('/police_stations')
  }

  /** Settlement statements, so a merchant can reconcile COD against payouts. */
  async listPayments(): Promise<unknown> {
    return this.request('/payments')
  }
}

function readMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>

  if (typeof record.message === 'string' && record.message) {
    return record.message
  }

  // Laravel validation errors arrive as { errors: { field: ["msg"] } }, and the
  // field name is the most useful part of the message for a merchant fixing an
  // address.
  if (record.errors && typeof record.errors === 'object') {
    const parts: string[] = []
    for (const [field, messages] of Object.entries(
      record.errors as Record<string, unknown>
    )) {
      const first = Array.isArray(messages) ? messages[0] : messages
      if (typeof first === 'string') parts.push(`${field}: ${first}`)
    }
    if (parts.length > 0) return parts.join('; ')
  }

  return null
}
