import { z } from 'zod'

export const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  categoryId: z.string().trim().min(1).optional(),
  description: z.string().trim().max(500).optional(),
})

export const updateTemplateMetaSchema = z.object({
  name: z.string().trim().min(2).max(100),
  categoryId: z.string().trim().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  // Gated by the plan's `premiumTemplates` entitlement. An unticked checkbox
  // sends nothing at all, hence the coercion from a possibly-absent value.
  isPremium: z
    .union([
      z.literal('on'),
      z.literal('true'),
      z.literal('false'),
      z.literal(''),
    ])
    .optional()
    .transform((value) => value === 'on' || value === 'true'),
})

export const createTemplateCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateMetaInput = z.infer<typeof updateTemplateMetaSchema>
export type CreateTemplateCategoryInput = z.infer<
  typeof createTemplateCategorySchema
>
