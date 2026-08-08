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
})

export const createTemplateCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateMetaInput = z.infer<typeof updateTemplateMetaSchema>
export type CreateTemplateCategoryInput = z.infer<
  typeof createTemplateCategorySchema
>
