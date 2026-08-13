import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { decryptSecret } from '@/lib/crypto'
import { mapPathaoEvent, mapSteadfastStatus } from './statusMap'
import type {
  CourierProvider,
  CourierShipmentStatus,
} from '@/generated/prisma/enums'

/**
 * Receiving status updates from couriers.
 *
 * These are unauthenticated public endpoints being called by a third party we
 * do not control, on behalf of a merchant we must identify. Three problems, and
 * the answers this module implements:
 *
 *   Which tenant is this for? Neither courier sends a tenant identifier, so the
 *   URL carries one: each CourierConfig owns a random 128-bit token that forms
 *   the last path segment of its callback URL. That token is the tenant
 *   routing key, which is why it is generated like a session token and never
 *   derived from an id.
 *
 *   Is this really the courier? The token alone is not proof — it travels in a
 *   URL, and URLs end up in logs and proxies. Where the courier supports it, a
 *   shared secret is compared as well: Pathao's `X-PATHAO-Signature`, or the
 *   bearer token Steadfast is configured with. Neither courier signs the body,
 *   so this is the strongest check available, and both comparisons are
 *   constant-time.
 *
 *   What did they say? Both send a small JSON object and neither guarantees its
 *   shape across versions. Everything here reads defensively and preserves the
 *   raw payload, so an unmapped field is a stored artefact rather than a crash
 *   in a handler the courier will retry forty times.
 */

export interface ResolvedWebhookTarget {
  organizationId: string
  configId: string
  provider: CourierProvider
  /** Decrypted shared secret, or null when the merchant has not set one. */
  secret: string | null
}

/**
 * Finds the courier account a callback URL belongs to.
 *
 * The token lookup is a unique-index hit, so a wrong token costs one indexed
 * read and reveals nothing about whether any other token exists.
 */
export async function resolveWebhookTarget(
  provider: CourierProvider,
  token: string
): Promise<ResolvedWebhookTarget | null> {
  if (!token || token.length < 16) return null

  const config = await prisma.courierConfig.findUnique({
    where: { webhookToken: token },
    select: {
      id: true,
      organizationId: true,
      provider: true,
      webhookSecret: true,
    },
  })

  // The provider is checked as well as the token: a Steadfast token arriving at
  // the Pathao endpoint is either a misconfiguration or someone probing, and
  // either way the payloads are not interchangeable.
  if (!config || config.provider !== provider) return null

  let secret: string | null = null
  if (config.webhookSecret) {
    try {
      secret = decryptSecret(config.webhookSecret)
    } catch {
      // An unreadable secret must fail closed. Treating it as "no secret set"
      // would silently downgrade a merchant who configured one.
      return null
    }
  }

  return {
    organizationId: config.organizationId,
    configId: config.id,
    provider: config.provider,
    secret,
  }
}

/** Constant-time comparison that tolerates differing lengths. */
export function secretMatches(
  expected: string | null,
  presented: string | null
): boolean {
  // No secret configured means the token in the URL is the only credential.
  // That is the couriers' own default — Steadfast's bearer header is optional —
  // so refusing here would break a working integration to enforce a policy the
  // provider does not offer.
  if (!expected) return true
  if (!presented) return false

  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  // timingSafeEqual throws on a length mismatch rather than returning false,
  // and a wrong-length secret is wrong regardless.
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Pulls a bearer token out of an Authorization header, in either spelling. */
export function readBearer(header: string | null): string | null {
  if (!header) return null
  const trimmed = header.trim()
  return trimmed.toLowerCase().startsWith('bearer ')
    ? trimmed.slice(7).trim()
    : trimmed
}

export interface ParsedCourierEvent {
  consignmentId: string | null
  merchantOrderId: string | null
  status: CourierShipmentStatus | null
  rawStatus: string | null
  message: string
  occurredAt: Date
  collectedAmountCents: number | null
  deliveryFeeCents: number | null
}

const MINOR_UNITS_PER_TAKA = 100

function toCents(value: unknown): number | null {
  const amount = typeof value === 'string' ? Number(value) : value
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  return Math.round(amount * MINOR_UNITS_PER_TAKA)
}

function readString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

/**
 * Parses a timestamp a courier sent, falling back to now.
 *
 * Both providers send `YYYY-MM-DD HH:MM:SS` with no zone. Reading that as UTC
 * keeps the timeline monotonic across servers; the alternative — the server's
 * local zone — makes the same event sort differently depending on which region
 * happened to receive the retry.
 */
function parseCourierDate(value: unknown): Date {
  const raw = readString(value)
  if (!raw) return new Date()

  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw

  const date = new Date(normalised)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

/**
 * Reads a Steadfast callback.
 *
 * Two notification types share one endpoint. `delivery_status` carries a real
 * status change; `tracking_update` is a human-readable progress note with no
 * status at all — "arrived at the sorting centre" — which is why `status` is
 * nullable here. Treating a tracking note as a status change would overwrite a
 * known state with a guess.
 */
export function parseSteadfastEvent(
  payload: unknown
): ParsedCourierEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const body = payload as Record<string, unknown>

  const consignmentId = readString(body.consignment_id)
  const merchantOrderId = readString(body.invoice)
  if (!consignmentId && !merchantOrderId) return null

  const notificationType =
    readString(body.notification_type) ?? 'delivery_status'
  const rawStatus = readString(body.status)
  const trackingMessage = readString(body.tracking_message)

  const isStatusUpdate = notificationType === 'delivery_status' && rawStatus

  return {
    consignmentId,
    merchantOrderId,
    status: isStatusUpdate ? mapSteadfastStatus(rawStatus) : null,
    rawStatus: isStatusUpdate ? rawStatus : null,
    message:
      trackingMessage ??
      (rawStatus
        ? `Steadfast reports ${rawStatus.replace(/_/g, ' ')}`
        : 'Steadfast sent a tracking update'),
    occurredAt: parseCourierDate(body.updated_at),
    // On a delivered parcel the COD amount is what the rider handed over.
    collectedAmountCents:
      isStatusUpdate && mapSteadfastStatus(rawStatus) === 'DELIVERED'
        ? toCents(body.cod_amount)
        : null,
    deliveryFeeCents: toCents(body.delivery_charge),
  }
}

/**
 * Reads a Pathao callback.
 *
 * Every event carries its name in `event`, which is the whole status vocabulary
 * — there is no separate status field. `collected_amount` appears only on the
 * events where money changed hands.
 */
export function parsePathaoEvent(payload: unknown): ParsedCourierEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const body = payload as Record<string, unknown>

  const event = readString(body.event)
  if (!event) return null

  // The integration handshake, sent when the merchant saves the URL in Pathao's
  // panel. It names no parcel and must be answered without touching anything.
  if (event === 'webhook_integration') return null

  const consignmentId = readString(body.consignment_id)
  const merchantOrderId = readString(body.merchant_order_id)
  if (!consignmentId && !merchantOrderId) return null

  const status = mapPathaoEvent(event)
  const reason = readString(body.reason)

  return {
    consignmentId,
    merchantOrderId,
    status,
    rawStatus: event,
    message: reason
      ? `${humanizePathaoEvent(event)} — ${reason}`
      : humanizePathaoEvent(event),
    occurredAt: parseCourierDate(body.timestamp ?? body.updated_at),
    collectedAmountCents: toCents(body.collected_amount),
    deliveryFeeCents: toCents(body.delivery_fee),
  }
}

/** `order.at-the-sorting-hub` -> `At the sorting hub`. */
function humanizePathaoEvent(event: string): string {
  const withoutPrefix = event.replace(/^order\./, '').replace(/^store\./, '')
  const words = withoutPrefix.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The value Pathao requires in the response header of every webhook call.
 *
 * Not a secret and not ours — it is a fixed constant published in their docs,
 * and their delivery system treats a response without it as a failed delivery
 * and retries. Getting this wrong looks exactly like a working integration that
 * silently receives every event four times.
 */
export const PATHAO_INTEGRATION_SECRET = 'f3992ecc-59da-4cbe-a049-a13da2018d51'

export const PATHAO_INTEGRATION_HEADER =
  'X-Pathao-Merchant-Webhook-Integration-Secret'
