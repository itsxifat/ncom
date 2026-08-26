import 'server-only'
import { prisma } from '@/server/db/client'
import { listPickerProducts } from '@/server/services/productService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import type { OfferFormStore } from '@/components/store/offer-form'

/**
 * What both offer screens need: the catalogue to pick from, and the stores and
 * pages an offer can be scoped to.
 *
 * Shared rather than written twice because the new and edit screens differ only
 * in what they seed the form with, and a catalogue that is loaded one way on one
 * screen and another way on the other is how a product shows up in the picker
 * but not in the size list.
 */
export async function loadOfferContext(organizationId: string): Promise<{
  currencyCode: string
  products: Awaited<ReturnType<typeof listPickerProducts>>['products']
  stores: OfferFormStore[]
}> {
  const [settings, picker, stores] = await Promise.all([
    getOrganizationSettings(organizationId),
    // Everything, not one page of it: the editor resolves every id an offer
    // already holds out of this list, and a product missing from it renders as
    // "Unknown product" on a bundle that is selling perfectly well.
    listPickerProducts(organizationId, { take: 200, includeArchived: true }),
    prisma.store.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        pages: {
          orderBy: { title: 'asc' },
          select: { id: true, title: true },
        },
      },
    }),
  ])

  return {
    currencyCode: settings?.currencyCode ?? picker.currencyCode,
    products: picker.products,
    stores,
  }
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
export function toLocalInput(date: Date | null): string {
  if (!date) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
