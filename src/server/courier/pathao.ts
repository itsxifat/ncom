import 'server-only'
import { mapPathaoSlug } from './statusMap'
import { requireBdPhone } from './phone'
import {
  COURIER_TIMEOUT_MS,
  CourierApiError,
  CourierNotConfiguredError,
  type CourierClient,
  type CourierConsignmentRequest,
  type CourierConsignmentResult,
  type CourierStatusResult,
} from './types'

/**
 * Pathao Courier merchant API (Aladdin), V1.
 *
 * Unlike Steadfast this is OAuth 2.0 with a password grant, which means every
 * call needs a bearer token and the token needs managing. Three consequences
 * shape this file:
 *
 *   Tokens are persisted, not just memoised. They live five days, and a
 *   serverless platform starts a fresh process constantly — an in-memory cache
 *   would re-authenticate on most cold starts, which is both slow and a good
 *   way to get rate limited. The caller supplies the stored token and a
 *   callback to write the new one back, so the token survives the process.
 *
 *   The refresh token is used before the password. Re-sending the merchant's
 *   portal password on every expiry works, but it means that password is in
 *   flight far more often than it needs to be.
 *
 *   A 401 mid-flight is recoverable. A token can be revoked or invalidated
 *   before its stated expiry, so a single 401 triggers one re-authentication
 *   and one replay rather than failing a dispatch that would have worked.
 */

const PRODUCTION_BASE_URL = 'https://api-hermes.pathao.com'
const SANDBOX_BASE_URL = 'https://courier-api-sandbox.pathao.com'

/** 48 = normal delivery, 12 = on-demand. Normal is what an ecommerce order wants. */
const DELIVERY_TYPE_NORMAL = 48
/** 1 = document, 2 = parcel. */
const ITEM_TYPE_PARCEL = 2
/** Pathao's floor. Sending less is rejected outright. */
const MIN_WEIGHT_KG = 0.5
const MAX_WEIGHT_KG = 10

/**
 * Re-authenticate this long before the stated expiry.
 *
 * A token that expires while a request is in flight fails a dispatch for no
 * reason; ten minutes is comfortably longer than any single call.
 */
const EXPIRY_SKEW_MS = 10 * 60 * 1000

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

export interface PathaoCredentials {
  clientId: string
  clientSecret: string
  username: string
  password: string
}

export interface PathaoSettings {
  /** Which of the merchant's Pathao stores parcels are picked up from. */
  storeId?: string | number | null
  deliveryType?: number | null
  itemType?: number | null
  defaultWeightKg?: number | null
}

export interface PathaoTokenState {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: Date | null
}

export interface PathaoStore {
  storeId: string
  storeName: string
  storeAddress: string
  isActive: boolean
  cityId: number | null
  zoneId: number | null
}

interface PathaoEnvelope<T = unknown> {
  message?: string
  type?: string
  code?: number
  data?: T
  errors?: Record<string, string[]>
}

export class PathaoClient implements CourierClient {
  readonly provider = 'PATHAO' as const

  private readonly baseUrl: string
  private readonly credentials: PathaoCredentials
  private readonly settings: PathaoSettings
  private token: PathaoTokenState
  private readonly persistToken:
    ((token: PathaoTokenState) => Promise<void>) | null

  constructor(options: {
    credentials: Partial<PathaoCredentials> | null | undefined
    settings?: PathaoSettings | null
    token?: PathaoTokenState | null
    testMode?: boolean
    /**
     * Called whenever a new token is issued, so it outlives the process. The
     * client works without it — it just re-authenticates every time.
     */
    onToken?: (token: PathaoTokenState) => Promise<void>
  }) {
    const { credentials } = options
    if (
      !credentials?.clientId ||
      !credentials.clientSecret ||
      !credentials.username ||
      !credentials.password
    ) {
      throw new CourierNotConfiguredError(
        'Pathao needs a client ID, client secret, username and password'
      )
    }

    this.baseUrl = options.testMode ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
    this.credentials = credentials as PathaoCredentials
    this.settings = options.settings ?? {}
    this.token = options.token ?? {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    }
    this.persistToken = options.onToken ?? null
  }

  // ── Authentication ─────────────────────────────────────────────────────

  private tokenIsFresh(): boolean {
    return Boolean(
      this.token.accessToken &&
      this.token.expiresAt &&
      this.token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()
    )
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.tokenIsFresh()) return this.token.accessToken!

    // Refresh first: it avoids putting the merchant's portal password on the
    // wire, and Pathao issues a fresh refresh token with every exchange.
    if (!force && this.token.refreshToken) {
      try {
        return await this.issueToken({
          grant_type: 'refresh_token',
          refresh_token: this.token.refreshToken,
        })
      } catch {
        // A refresh token can be expired or revoked independently. Falling
        // through to the password grant is the whole point of keeping the
        // credentials — a dead refresh token must not fail the dispatch.
      }
    }

    return this.issueToken({
      grant_type: 'password',
      username: this.credentials.username,
      password: this.credentials.password,
    })
  }

  private async issueToken(grant: Record<string, string>): Promise<string> {
    const body = await this.rawRequest<
      PathaoEnvelope & {
        access_token?: string
        refresh_token?: string
        expires_in?: number
      }
    >('/aladdin/api/v1/issue-token', {
      method: 'POST',
      body: {
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        ...grant,
      },
    })

    // Pathao returns the token at the envelope root on success, but wraps it in
    // `data` on some deployments. Both spellings are accepted rather than
    // guessing which one this merchant's account will produce.
    const payload = (body.data ?? body) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }

    if (!payload.access_token) {
      throw new CourierApiError(
        'PATHAO',
        readMessage(body) ??
          'Pathao did not return an access token — check the client ID, secret, username and password',
        { body, retryable: false }
      )
    }

    this.token = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? this.token.refreshToken,
      expiresAt: new Date(Date.now() + (payload.expires_in ?? 432_000) * 1_000),
    }

    if (this.persistToken) {
      // Never allowed to fail the call that triggered it: a token that could not
      // be cached is a performance problem on the next request, not an error
      // for this one.
      await this.persistToken(this.token).catch((cause) =>
        console.error('[pathao] could not persist token', cause)
      )
    }

    return this.token.accessToken!
  }

  // ── Transport ──────────────────────────────────────────────────────────

  /** A request with no authentication, used for the token exchange itself. */
  private async rawRequest<T>(
    path: string,
    init: {
      method: 'GET' | 'POST'
      body?: unknown
      token?: string
    }
  ): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(COURIER_TIMEOUT_MS),
        cache: 'no-store',
      })
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
      throw new CourierApiError(
        'PATHAO',
        timedOut
          ? `Pathao did not respond within ${COURIER_TIMEOUT_MS / 1000}s`
          : 'Could not reach Pathao',
        { retryable: true }
      )
    }

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      throw new CourierApiError(
        'PATHAO',
        `Pathao returned a non-JSON response (${response.status})`,
        { statusCode: response.status, body: text.slice(0, 500) }
      )
    }

    if (!response.ok) {
      throw new CourierApiError(
        'PATHAO',
        readMessage(body) ?? `Pathao responded ${response.status}`,
        {
          statusCode: response.status,
          body,
          retryable: response.status >= 500 || response.status === 429,
        }
      )
    }

    return (body ?? {}) as T
  }

  /**
   * An authenticated request, retried once on 401.
   *
   * The retry is the difference between a dispatch that fails because a token
   * was revoked early and one that quietly re-authenticates. Bounded to a single
   * attempt so genuinely wrong credentials fail fast instead of looping.
   */
  private async request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' }
  ): Promise<T> {
    const token = await this.accessToken()

    try {
      return await this.rawRequest<T>(path, { ...init, token })
    } catch (cause) {
      if (cause instanceof CourierApiError && cause.statusCode === 401) {
        const fresh = await this.accessToken(true)
        return this.rawRequest<T>(path, { ...init, token: fresh })
      }
      throw cause
    }
  }

  // ── Operations ─────────────────────────────────────────────────────────

  async verify(): Promise<{ ok: true; detail: string }> {
    // Listing stores proves the token works *and* tells the merchant which
    // store ids exist — the one piece of configuration they cannot guess and
    // without which no parcel can be created.
    const stores = await this.listStores()

    if (stores.length === 0) {
      return {
        ok: true,
        detail:
          'Connected, but this Pathao account has no stores yet. Create one in the Pathao merchant panel first.',
      }
    }

    const selected = this.settings.storeId
      ? stores.find(
          (store) => String(store.storeId) === String(this.settings.storeId)
        )
      : null

    return {
      ok: true,
      detail: selected
        ? `Connected. Pickup store: ${selected.storeName}.`
        : `Connected. ${stores.length} store${stores.length === 1 ? '' : 's'} available — pick a pickup store below.`,
    }
  }

  async listStores(): Promise<PathaoStore[]> {
    const body = await this.request<
      PathaoEnvelope<{ data?: unknown[] } | unknown[]>
    >('/aladdin/api/v1/stores')

    // Pathao paginates stores, so `data` is itself an envelope with a `data`
    // array inside it. Both shapes are handled because the sandbox and
    // production have differed on this.
    const rows = Array.isArray(body.data)
      ? body.data
      : Array.isArray((body.data as { data?: unknown[] })?.data)
        ? ((body.data as { data?: unknown[] }).data ?? [])
        : []

    return rows.map((row) => {
      const store = (row ?? {}) as Record<string, unknown>
      return {
        storeId: String(store.store_id ?? ''),
        storeName: String(store.store_name ?? 'Unnamed store'),
        storeAddress: String(store.store_address ?? ''),
        isActive: Number(store.is_active ?? 0) === 1,
        cityId: store.city_id == null ? null : Number(store.city_id),
        zoneId: store.zone_id == null ? null : Number(store.zone_id),
      }
    })
  }

  async createConsignment(
    request: CourierConsignmentRequest
  ): Promise<CourierConsignmentResult> {
    const storeId = this.settings.storeId
    if (!storeId) {
      throw new CourierNotConfiguredError(
        'Choose a Pathao pickup store before dispatching to Pathao'
      )
    }

    const recipientPhone = requireBdPhone(request.recipientPhone)

    // Pathao rejects an address shorter than 10 characters outright, and a
    // dispatch that fails validation at the courier is far more expensive to
    // diagnose than one refused here with the reason attached.
    const address = request.recipientAddress.trim()
    if (address.length < 10) {
      throw new CourierApiError(
        'PATHAO',
        'Pathao needs a delivery address of at least 10 characters',
        { retryable: false }
      )
    }

    const weight = clampWeight(
      request.itemWeightKg ?? this.settings.defaultWeightKg ?? MIN_WEIGHT_KG
    )

    const payload = {
      store_id: Number(storeId),
      merchant_order_id: request.merchantOrderId,
      recipient_name: request.recipientName.trim().slice(0, 100),
      recipient_phone: recipientPhone,
      ...(request.alternativePhone
        ? { recipient_secondary_phone: request.alternativePhone }
        : {}),
      recipient_address: address.slice(0, 220),
      delivery_type: this.settings.deliveryType ?? DELIVERY_TYPE_NORMAL,
      item_type: this.settings.itemType ?? ITEM_TYPE_PARCEL,
      ...(request.note
        ? { special_instruction: request.note.slice(0, 220) }
        : {}),
      item_quantity: Math.max(1, request.itemQuantity ?? 1),
      item_weight: String(weight),
      ...(request.itemDescription
        ? { item_description: request.itemDescription.slice(0, 220) }
        : {}),
      // Pathao takes a whole-taka integer here, not a decimal.
      amount_to_collect: Math.round(toTaka(request.codAmountCents)),
    }

    const body = await this.request<
      PathaoEnvelope<{
        consignment_id?: string
        merchant_order_id?: string
        order_status?: string
        delivery_fee?: number
      }>
    >('/aladdin/api/v1/orders', { method: 'POST', body: payload })

    const data = body.data
    if (!data?.consignment_id) {
      throw new CourierApiError(
        'PATHAO',
        readMessage(body) ??
          'Pathao accepted the request but returned no consignment',
        { body }
      )
    }

    const rawStatus = data.order_status ?? 'Pending'

    return {
      consignmentId: String(data.consignment_id),
      // Pathao has no separate tracking code — the consignment id is what a
      // customer tracks with.
      trackingCode: String(data.consignment_id),
      status: mapPathaoSlug(rawStatus),
      rawStatus,
      deliveryFeeCents: toCents(data.delivery_fee),
      raw: body,
    }
  }

  async fetchStatus(reference: {
    consignmentId?: string | null
  }): Promise<CourierStatusResult | null> {
    // Pathao's info endpoint keys only on its own consignment id; there is no
    // lookup by merchant order id, so a parcel whose create call was lost
    // cannot be found here and is reconciled by the merchant instead.
    if (!reference.consignmentId) return null

    const body = await this.request<
      PathaoEnvelope<{
        order_status?: string
        order_status_slug?: string
        updated_at?: string
      }>
    >(
      `/aladdin/api/v1/orders/${encodeURIComponent(reference.consignmentId)}/info`
    )

    const data = body.data
    const rawStatus = data?.order_status_slug ?? data?.order_status
    if (!rawStatus) return null

    return {
      status: mapPathaoSlug(rawStatus),
      rawStatus,
      message: `Pathao reports ${(data?.order_status ?? rawStatus).replace(/-/g, ' ')}`,
      occurredAt: parseDate(data?.updated_at) ?? new Date(),
      raw: body,
    }
  }

  /** Quotes a delivery before committing to it. */
  async calculatePrice(input: {
    recipientCity: number
    recipientZone: number
    weightKg?: number
  }): Promise<{ finalPriceCents: number; raw: unknown }> {
    const storeId = this.settings.storeId
    if (!storeId) {
      throw new CourierNotConfiguredError('Choose a Pathao pickup store first')
    }

    const body = await this.request<
      PathaoEnvelope<{ price?: number; final_price?: number }>
    >('/aladdin/api/v1/merchant/price-plan', {
      method: 'POST',
      body: {
        store_id: Number(storeId),
        item_type: this.settings.itemType ?? ITEM_TYPE_PARCEL,
        delivery_type: this.settings.deliveryType ?? DELIVERY_TYPE_NORMAL,
        item_weight: clampWeight(input.weightKg ?? MIN_WEIGHT_KG),
        recipient_city: input.recipientCity,
        recipient_zone: input.recipientZone,
      },
    })

    return {
      finalPriceCents: toCents(body.data?.final_price ?? body.data?.price) ?? 0,
      raw: body,
    }
  }

  async listCities(): Promise<{ cityId: number; cityName: string }[]> {
    const body = await this.request<PathaoEnvelope<{ data?: unknown[] }>>(
      '/aladdin/api/v1/city-list'
    )
    return (body.data?.data ?? []).map((row) => {
      const city = (row ?? {}) as Record<string, unknown>
      return {
        cityId: Number(city.city_id),
        cityName: String(city.city_name ?? ''),
      }
    })
  }

  async listZones(
    cityId: number
  ): Promise<{ zoneId: number; zoneName: string }[]> {
    const body = await this.request<PathaoEnvelope<{ data?: unknown[] }>>(
      `/aladdin/api/v1/cities/${cityId}/zone-list`
    )
    return (body.data?.data ?? []).map((row) => {
      const zone = (row ?? {}) as Record<string, unknown>
      return {
        zoneId: Number(zone.zone_id),
        zoneName: String(zone.zone_name ?? ''),
      }
    })
  }

  async listAreas(
    zoneId: number
  ): Promise<{ areaId: number; areaName: string }[]> {
    const body = await this.request<PathaoEnvelope<{ data?: unknown[] }>>(
      `/aladdin/api/v1/zones/${zoneId}/area-list`
    )
    return (body.data?.data ?? []).map((row) => {
      const area = (row ?? {}) as Record<string, unknown>
      return {
        areaId: Number(area.area_id),
        areaName: String(area.area_name ?? ''),
      }
    })
  }

  /** The token state after any refresh, so a caller can persist it explicitly. */
  currentToken(): PathaoTokenState {
    return this.token
  }
}

function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return MIN_WEIGHT_KG
  return Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, weight))
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  // Pathao sends "2024-12-27 23:49:43" without a zone. Treating it as UTC keeps
  // event ordering stable; the exact wall-clock offset matters less than not
  // having timestamps jump around between servers in different regions.
  const normalised = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'
  const date = new Date(normalised)
  return Number.isNaN(date.getTime()) ? null : date
}

function readMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>

  // Field-level errors first — "recipient_phone must be 11 characters" is
  // actionable, "Validation failed" is not.
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

  if (typeof record.message === 'string' && record.message) {
    return record.message
  }

  return null
}
