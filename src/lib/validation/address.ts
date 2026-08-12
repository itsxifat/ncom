import { z } from 'zod'

/**
 * Shared address shape.
 *
 * Addresses are stored as Json on Cart and Order (a snapshot of what the buyer
 * entered at the time) and as rows on CustomerAddress (the buyer's editable
 * address book). One schema validates all three so a saved address can be
 * copied into an order without a translation step.
 *
 * Deliberately permissive about province and postal code: they are required in
 * the US and India, meaningless in much of the Gulf, and optional in Ireland.
 * Enforcing them globally is the most common way a checkout locks out real
 * customers, so per-country requirements belong in country metadata, not here.
 */
export const addressSchema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  company: z.string().trim().max(120).optional(),
  address1: z.string().trim().min(1, 'Street address is required').max(200),
  address2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, 'City is required').max(100),
  provinceCode: z.string().trim().max(10).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2, 'Country must be a 2-letter ISO code')
    .toUpperCase(),
  postalCode: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
})

export type AddressInput = z.infer<typeof addressSchema>

export const customerAddressSchema = addressSchema.extend({
  isDefault: z.boolean().default(false),
})

export type CustomerAddressInput = z.infer<typeof customerAddressSchema>
