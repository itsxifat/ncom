import { z } from 'zod'

/** Store-wide settings, shipping, tax and payment configuration. */

export const storeSettingsSchema = z.object({
  currencyCode: z
    .string()
    .trim()
    .length(3, 'Use a 3-letter ISO currency code')
    .toUpperCase(),
  weightUnit: z.enum(['GRAM', 'KILOGRAM', 'OUNCE', 'POUND']),
  pricesIncludeTax: z.boolean().default(false),
  taxesIncludedInShipping: z.boolean().default(false),
  customerAccountsEnabled: z.boolean().default(true),
  requiresCustomerAccount: z.boolean().default(false),
  allowOutOfStockPurchase: z.boolean().default(false),
  orderNumberPrefix: z.string().trim().max(10).default('#'),
  orderNumberSuffix: z.string().trim().max(10).default(''),
  supportEmail: z.email().or(z.literal('')).optional(),
  supportPhone: z.string().trim().max(30).optional(),
  businessName: z.string().trim().max(200).optional(),
})

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>

export const shippingZoneSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  /**
   * Empty means "rest of world" — the catch-all zone. That is a real
   * configuration, not a validation failure, so an empty list is allowed.
   */
  countryCodes: z
    .array(z.string().trim().length(2).toUpperCase())
    .max(250)
    .default([]),
})

export type ShippingZoneInput = z.infer<typeof shippingZoneSchema>

export const shippingRateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    description: z.string().trim().max(200).optional(),
    priceCents: z.number().int().min(0).max(100_000_000),
    minSubtotalCents: z.number().int().min(0).optional().nullable(),
    maxSubtotalCents: z.number().int().min(0).optional().nullable(),
    minWeightGrams: z.number().int().min(0).optional().nullable(),
    maxWeightGrams: z.number().int().min(0).optional().nullable(),
    position: z.number().int().min(0).default(0),
  })
  .refine(
    (value) =>
      value.minSubtotalCents == null ||
      value.maxSubtotalCents == null ||
      value.maxSubtotalCents >= value.minSubtotalCents,
    {
      // An inverted band matches nothing, so the rate silently never applies.
      message: 'The maximum subtotal must be at least the minimum',
      path: ['maxSubtotalCents'],
    }
  )
  .refine(
    (value) =>
      value.minWeightGrams == null ||
      value.maxWeightGrams == null ||
      value.maxWeightGrams >= value.minWeightGrams,
    {
      message: 'The maximum weight must be at least the minimum',
      path: ['maxWeightGrams'],
    }
  )

export type ShippingRateInput = z.infer<typeof shippingRateSchema>

export const taxRateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  countryCode: z
    .string()
    .trim()
    .length(2, 'Use a 2-letter ISO code')
    .toUpperCase(),
  provinceCode: z.string().trim().max(10).optional().nullable(),
  /** Basis points: 8.25% is 825. */
  rateBps: z
    .number()
    .int()
    .min(0)
    .max(10000, 'A tax rate above 100% is almost certainly a typo'),
  appliesToShipping: z.boolean().default(false),
  taxCode: z.string().trim().max(40).optional().nullable(),
})

export type TaxRateInput = z.infer<typeof taxRateSchema>

export const paymentProviderSchema = z.object({
  provider: z.enum([
    'STRIPE',
    'PAYPAL',
    'RAZORPAY',
    'SSLCOMMERZ',
    'BKASH',
    'MANUAL',
    'CASH_ON_DELIVERY',
  ]),
  displayName: z.string().trim().min(1).max(120),
  isEnabled: z.boolean().default(false),
  testMode: z.boolean().default(true),
  instructions: z.string().trim().max(5000).optional(),
  /**
   * Provider API keys. Encrypted before storage — see lib/crypto.ts — and
   * never returned to the client once saved; the form submits an empty value
   * to mean "leave unchanged".
   */
  credentials: z.record(z.string().max(60), z.string().max(500)).optional(),
})

export type PaymentProviderInput = z.infer<typeof paymentProviderSchema>

export type StoreFormState = { error?: string; success?: string } | undefined
