import { z } from 'zod'

/**
 * Collection input, including the rule language for automated collections.
 *
 * The rule set is deliberately small and closed. Every field/operator pair
 * below compiles to a Prisma `where` fragment in collectionService — there is
 * no free-form predicate, because a rule language that accepts arbitrary
 * column names is a tenant-controlled query builder, and that is an injection
 * surface and an unindexed-scan generator at the same time.
 */

export const collectionRuleSchema = z.object({
  field: z.enum([
    'title',
    'productType',
    'vendor',
    'tag',
    'price',
    'inventoryQuantity',
    'weightGrams',
  ]),
  operator: z.enum([
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'greaterThan',
    'lessThan',
  ]),
  value: z.string().trim().min(1).max(200),
})

export type CollectionRule = z.infer<typeof collectionRuleSchema>

export const createCollectionSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    handle: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens')
      .max(80)
      .optional(),
    description: z.string().max(50_000).optional(),
    imageMediaId: z.string().optional().nullable(),
    type: z.enum(['MANUAL', 'AUTOMATED']).default('MANUAL'),
    rules: z.array(collectionRuleSchema).max(20).default([]),
    rulesMatch: z.enum(['ALL', 'ANY']).default('ALL'),
    sortOrder: z
      .enum([
        'MANUAL',
        'BEST_SELLING',
        'TITLE_ASC',
        'TITLE_DESC',
        'PRICE_ASC',
        'PRICE_DESC',
        'CREATED_ASC',
        'CREATED_DESC',
      ])
      .default('MANUAL'),
    seoTitle: z.string().trim().max(200).optional(),
    seoDescription: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.type === 'MANUAL' || value.rules.length > 0, {
    // An automated collection with no rules matches every product, which is
    // never what the merchant meant and silently publishes the whole catalog.
    message: 'An automated collection needs at least one rule',
    path: ['rules'],
  })

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>

export const updateCollectionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .max(80)
    .optional(),
  description: z.string().max(50_000).optional(),
  imageMediaId: z.string().optional().nullable(),
  rules: z.array(collectionRuleSchema).max(20).optional(),
  rulesMatch: z.enum(['ALL', 'ANY']).optional(),
  sortOrder: z
    .enum([
      'MANUAL',
      'BEST_SELLING',
      'TITLE_ASC',
      'TITLE_DESC',
      'PRICE_ASC',
      'PRICE_DESC',
      'CREATED_ASC',
      'CREATED_DESC',
    ])
    .optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
})

export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>
