import { z } from 'zod'

/**
 * Discount input.
 *
 * The value field a discount reads depends on its type, which a flat schema
 * cannot express — a PERCENTAGE with `valueCents` set and `valueBps` empty
 * would save cleanly and then silently discount nothing. The refinements below
 * turn each of those into a field-level error the merchant can act on.
 */

export const createDiscountSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    method: z.enum(['CODE', 'AUTOMATIC']).default('CODE'),
    type: z.enum([
      'PERCENTAGE',
      'FIXED_AMOUNT',
      'FREE_SHIPPING',
      'BUY_X_GET_Y',
    ]),

    /** Basis points: 10% is 1000. */
    valueBps: z.number().int().min(0).max(10000).optional().nullable(),
    valueCents: z.number().int().min(0).max(100_000_000).optional().nullable(),

    appliesTo: z.enum(['ALL', 'PRODUCTS', 'COLLECTIONS']).default('ALL'),
    targetProductIds: z.array(z.string()).max(500).default([]),
    targetCollectionIds: z.array(z.string()).max(100).default([]),

    minimumSubtotalCents: z.number().int().min(0).optional().nullable(),
    minimumQuantity: z.number().int().min(0).optional().nullable(),

    buyQuantity: z.number().int().min(1).max(100).optional().nullable(),
    getQuantity: z.number().int().min(1).max(100).optional().nullable(),

    usageLimit: z.number().int().min(1).optional().nullable(),
    oncePerCustomer: z.boolean().default(false),
    combinesWithOther: z.boolean().default(false),

    startsAt: z.coerce.date().default(() => new Date()),
    endsAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),

    codes: z
      .array(
        z
          .string()
          .trim()
          .min(3, 'A code needs at least 3 characters')
          .max(60)
          // Spaces and punctuation survive copy-paste badly and are hard to
          // read out over the phone, which is how most codes are shared.
          .regex(
            /^[A-Za-z0-9_-]+$/,
            'Use letters, numbers, hyphens and underscores'
          )
      )
      .max(50)
      .default([]),
  })
  .refine((value) => value.type !== 'PERCENTAGE' || (value.valueBps ?? 0) > 0, {
    message: 'Enter a percentage above zero',
    path: ['valueBps'],
  })
  .refine(
    (value) => value.type !== 'FIXED_AMOUNT' || (value.valueCents ?? 0) > 0,
    { message: 'Enter an amount above zero', path: ['valueCents'] }
  )
  .refine(
    (value) =>
      value.type !== 'BUY_X_GET_Y' ||
      ((value.buyQuantity ?? 0) > 0 && (value.getQuantity ?? 0) > 0),
    { message: 'Set both the buy and get quantities', path: ['buyQuantity'] }
  )
  .refine((value) => value.method !== 'CODE' || value.codes.length > 0, {
    message: 'A code discount needs at least one code',
    path: ['codes'],
  })
  .refine(
    (value) =>
      value.appliesTo !== 'PRODUCTS' || value.targetProductIds.length > 0,
    { message: 'Choose at least one product', path: ['targetProductIds'] }
  )
  .refine(
    (value) =>
      value.appliesTo !== 'COLLECTIONS' || value.targetCollectionIds.length > 0,
    { message: 'Choose at least one collection', path: ['targetCollectionIds'] }
  )
  .refine((value) => !value.endsAt || value.endsAt > value.startsAt, {
    message: 'The end date must be after the start date',
    path: ['endsAt'],
  })

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>

export type DiscountFormState = { error?: string; success?: string } | undefined
