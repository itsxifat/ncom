import { z } from 'zod'

/**
 * Courier settings input.
 *
 * The thresholds are the interesting part. They arrive from a form where the
 * merchant types a percentage, and they are stored as basis points — so the
 * conversion happens here, once, rather than in three places that will
 * eventually disagree about whether 70 means 70% or 0.7%.
 */

export const courierProviderSchema = z.enum(['STEADFAST', 'PATHAO'])

export const courierCredentialsSchema = z.object({
  provider: courierProviderSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  isEnabled: z.boolean().optional(),
  testMode: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  // Values are opaque here: what counts as a valid API key is the courier's
  // opinion, not ours, and the connection test is what actually answers it.
  // Length is capped only to stop a paste accident becoming a large row.
  credentials: z.record(z.string(), z.string().max(2000)).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

export type CourierCredentialsInput = z.infer<typeof courierCredentialsSchema>

/**
 * A Steadfast merchant portal login used for screening.
 *
 * No format constraint on the password: it is the merchant's existing portal
 * password and we are in no position to have opinions about it. The account
 * test is what tells them whether it works.
 */
export const fraudAccountSchema = z.object({
  email: z.email('Enter the email you sign in to Steadfast with'),
  password: z.string().min(1, 'Enter the password for that account').max(200),
  label: z.string().trim().max(60).optional(),
})

export type FraudAccountInput = z.infer<typeof fraudAccountSchema>

export const courierAutomationSchema = z.object({
  autoDispatchEnabled: z.boolean(),
  fraudCheckEnabled: z.boolean(),

  /**
   * Percentage as the merchant typed it, converted to basis points on the way
   * out. Accepting one decimal place matters: the difference between 70% and
   * 70.5% is a real policy choice for a high-volume store. Zero switches the
   * rate rule off entirely.
   */
  minDeliveryRatePercent: z.coerce.number().min(0).max(100),
  /** Minimum parcels in the customer's history at all, delivered or refused. */
  minTotalParcels: z.coerce.number().int().min(0).max(1000),
  minDeliveredOrders: z.coerce.number().int().min(0).max(1000),
  maxFraudReports: z.coerce.number().int().min(0).max(1000),
  /** Empty means "do not check absolute cancellations at all". */
  maxCancelledOrders: z.coerce.number().int().min(0).max(10_000).nullable(),

  allowUnknownCustomers: z.boolean(),
  /** Major units in the store's currency; converted to minor units by the action. */
  manualReviewAbove: z.coerce.number().min(0).nullable(),
  dispatchDelayMinutes: z.coerce.number().int().min(0).max(10_080),
  requirePaidOrders: z.boolean(),
  fraudCacheHours: z.coerce.number().int().min(1).max(720),
  autoCancelOnFail: z.boolean(),
})

export type CourierAutomationInput = z.infer<typeof courierAutomationSchema>

export const phoneLookupSchema = z.object({
  phone: z.string().trim().min(6).max(20),
})

/** Percent (70.5) -> basis points (7050). */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100)
}

/** Basis points (7050) -> percent (70.5). */
export function basisPointsToPercent(bps: number): number {
  return bps / 100
}
