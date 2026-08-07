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

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  subdomain: subdomainShape.optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  subdomain: subdomainShape.optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
