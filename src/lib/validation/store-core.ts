import { z } from 'zod'
import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'

const subdomainShape = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(63, 'Must be at most 63 characters')
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Only lowercase letters, numbers, and hyphens (no leading/trailing hyphen)'
  )
  .refine(
    (value) => !RESERVED_SUBDOMAINS.has(value),
    'This subdomain is reserved'
  )

export const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(100),
  subdomain: subdomainShape.optional(),
  // Chosen once, at creation. Every order is recorded in it and it cannot be
  // changed after the first sale — see organizationSettingsService.updateOrganizationSettings.
  currencyCode: z.string().trim().length(3).toUpperCase().default('USD'),
})

export const updateStoreSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  subdomain: subdomainShape.optional(),
})

export type CreateStoreInput = z.infer<typeof createStoreSchema>
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>
