import { z } from 'zod'

const RESERVED_PAGE_SLUGS = new Set([
  'api',
  '_next',
  'preview',
  'sitemap.xml',
  'robots.txt',
])

export const slugShape = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Only lowercase letters, numbers, and hyphens'
  )
  .refine((value) => !RESERVED_PAGE_SLUGS.has(value), 'This slug is reserved')

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(150),
  slug: slugShape.optional(),
})

export const updatePageSeoSchema = z.object({
  title: z.string().trim().min(1).max(150),
  slug: slugShape,
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(300).optional(),
  ogImageMediaId: z.string().trim().min(1).optional(),
  robotsIndex: z.boolean(),
})

export type CreatePageInput = z.infer<typeof createPageSchema>
export type UpdatePageSeoInput = z.infer<typeof updatePageSeoSchema>
