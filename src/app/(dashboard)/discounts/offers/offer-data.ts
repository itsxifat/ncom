import 'server-only'
import { prisma } from '@/server/db/client'
import {
  getPickerProducts,
  listPickerProducts,
  type PickerProduct,
} from '@/server/services/productService'
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
export async function loadOfferContext(
  organizationId: string,
  /**
   * Products this offer already holds. Fetched by id alongside the first page,
   * because the editor resolves every id it is holding out of the same list and
   * one that is not in it renders as "Unknown product" on a bundle that is
   * selling perfectly well.
   */
  referenceIds: string[] = []
): Promise<{
  currencyCode: string
  products: PickerProduct[]
  /** Where the picker's second page starts. Null when there is no second page. */
  productsCursor: string | null
  productsTotal: number | null
  stores: OfferFormStore[]
}> {
  const [settings, picker, referenced, stores] = await Promise.all([
    getOrganizationSettings(organizationId),
    // One page, not the whole catalogue: the picker fetches the next as the
    // merchant scrolls, and half of a merged catalogue is the merchant's own
    // website — which should not be asked for forty thousand products so that
    // three can be ticked.
    listPickerProducts(organizationId, { take: 60, includeArchived: true }),
    getPickerProducts(organizationId, referenceIds),
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

  const onPage = new Set(picker.products.map((product) => product.id))

  return {
    currencyCode: settings?.currencyCode ?? picker.currencyCode,
    products: [
      ...picker.products,
      ...referenced.filter((product) => !onPage.has(product.id)),
    ],
    productsCursor: picker.nextCursor,
    productsTotal: picker.total,
    stores,
  }
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
export function toLocalInput(date: Date | null): string {
  if (!date) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
