import { z } from 'zod'

/**
 * Category input.
 *
 * The tree is three levels deep — category → subcategory → child category —
 * and that ceiling is enforced in categoryService rather than here, because it
 * depends on where the parent sits and this file cannot see the database.
 */

/** Root, subcategory, child category. Nothing below. */
export const MAX_CATEGORY_DEPTH = 3

export const CATEGORY_LEVEL_LABELS = [
  'Category',
  'Subcategory',
  'Child category',
] as const

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens')
    .max(120)
    .optional()
    .or(z.literal('')),
  parentId: z.string().nullable().optional(),
  description: z.string().max(10_000).optional(),
  // Uppercased by the service. Short because its job is to be readable inside
  // a SKU ("DRS-0042-M"), not to describe the category.
  code: z
    .string()
    .trim()
    .max(12, 'Keep the code to 12 characters or fewer')
    .optional(),
  imageMediaId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  position: z.number().int().min(0).max(100_000).default(0),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
})

export type CategoryInput = z.infer<typeof categorySchema>

export const updateCategorySchema = categorySchema.partial()

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

/**
 * What happens to the children of a deleted category.
 *
 * Defaults to lifting them up a level rather than deleting them: a category is
 * a label, and removing "Womenswear" should not remove "Dresses" and every
 * product filed under it. Deleting the whole subtree stays available because
 * sometimes a whole department really is gone.
 */
export const deleteCategorySchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['reparent', 'cascade']).default('reparent'),
})

export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>

export const reorderCategoriesSchema = z.object({
  ids: z.array(z.string().min(1)).max(500),
})
