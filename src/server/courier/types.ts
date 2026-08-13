import type {
  CourierProvider,
  CourierShipmentStatus,
} from '@/generated/prisma/enums'

/**
 * The shape every courier is reduced to.
 *
 * Steadfast and Pathao disagree about almost everything — field names, id
 * types, whether an address is one string or four numeric zone ids, whether
 * money is a float or an integer. The dispatch service is written against these
 * interfaces so that adding a third courier is a new file in this directory
 * rather than a third branch through every call site.
 */

/** What the merchant's account owes the courier, or is owed by them. */
export interface CourierBalance {
  currentBalanceCents: number
}

/** A parcel handed to a courier. */
export interface CourierConsignmentRequest {
  /** Our order number, sent as the courier's invoice / merchant_order_id. */
  merchantOrderId: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  /** What the rider collects at the door, in minor units. Zero when prepaid. */
  codAmountCents: number
  note?: string | null
  itemDescription?: string | null
  itemQuantity?: number
  /** Kilograms. Pathao requires it; Steadfast ignores it. */
  itemWeightKg?: number
  alternativePhone?: string | null
  recipientEmail?: string | null
}

export interface CourierConsignmentResult {
  consignmentId: string
  trackingCode: string | null
  status: CourierShipmentStatus
  rawStatus: string | null
  /** What the courier says the delivery will cost, when it tells us up front. */
  deliveryFeeCents: number | null
  /** Untouched provider response, stored for disputes. */
  raw: unknown
}

/** One reading of a parcel's state, from a poll or a webhook. */
export interface CourierStatusResult {
  status: CourierShipmentStatus
  rawStatus: string | null
  message: string | null
  occurredAt: Date
  collectedAmountCents?: number | null
  deliveryFeeCents?: number | null
  raw: unknown
}

/**
 * A courier client, constructed per organisation from that organisation's own
 * decrypted credentials. Never cached across tenants.
 */
export interface CourierClient {
  readonly provider: CourierProvider

  /**
   * Proves the stored credentials work, and returns something the merchant can
   * see so a green tick means more than "no exception was thrown".
   */
  verify(): Promise<{ ok: true; detail: string }>

  createConsignment(
    request: CourierConsignmentRequest
  ): Promise<CourierConsignmentResult>

  /**
   * Reads a parcel's current state. Takes both identifiers because the two
   * couriers index on different ones and either may be all we have: Steadfast
   * can look up by consignment id, invoice or tracking code, Pathao only by its
   * own consignment id.
   */
  fetchStatus(reference: {
    consignmentId?: string | null
    merchantOrderId?: string | null
    trackingCode?: string | null
  }): Promise<CourierStatusResult | null>

  /** Account balance, where the courier exposes one. */
  fetchBalance?(): Promise<CourierBalance>
}

/**
 * A courier said no.
 *
 * Carries the HTTP status and the provider's own body so the merchant sees
 * "recipient_phone must be 11 digits" rather than "dispatch failed", which is
 * the difference between a fixable order and a support ticket.
 */
export class CourierApiError extends Error {
  readonly provider: CourierProvider
  readonly statusCode: number | null
  readonly body: unknown
  /**
   * Whether trying again unchanged could work. A 5xx or a timeout is worth a
   * retry; a rejected phone number will be rejected identically forever, and
   * retrying it just burns the dispatch budget and delays the human who needs
   * to fix the address.
   */
  readonly retryable: boolean

  constructor(
    provider: CourierProvider,
    message: string,
    options: {
      statusCode?: number | null
      body?: unknown
      retryable?: boolean
    } = {}
  ) {
    super(message)
    this.name = 'CourierApiError'
    this.provider = provider
    this.statusCode = options.statusCode ?? null
    this.body = options.body ?? null
    this.retryable =
      options.retryable ??
      // Default from the status: anything the courier did not answer, or
      // answered with a server error or a rate limit, is worth another go.
      (options.statusCode == null ||
        options.statusCode >= 500 ||
        options.statusCode === 429)
  }
}

/** Courier credentials are missing or incomplete — a setup problem, not a fault. */
export class CourierNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CourierNotConfiguredError'
  }
}

/**
 * How long to wait on a courier before giving up.
 *
 * Dispatch happens off the buyer's critical path, so this can be generous
 * enough for a slow provider — but not so generous that a hung connection pins
 * a serverless invocation until the platform kills it.
 */
export const COURIER_TIMEOUT_MS = 15_000
