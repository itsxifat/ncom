'use server'

import { getActiveOrganization } from '@/server/services/organizationService'
import { findOrderByScan } from '@/server/services/labelService'

/**
 * Turns whatever came off a barcode into an order to open.
 *
 * A server action rather than a route so the lookup is scoped to the caller's
 * workspace by the session, not by anything the scanner said. Order numbers are
 * sequential and guessable, and an endpoint that resolved one for anybody would
 * be a way to walk another merchant's order book.
 */
export async function findScannedOrderAction(
  code: string,
  storeId?: string
): Promise<
  | { ok: true; orderId: string; orderNumber: string; storeName: string | null }
  | { ok: false; error: string }
> {
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, error: 'Nothing scanned' }

  try {
    const { organization } = await getActiveOrganization()
    const order = await findOrderByScan(organization.id, trimmed, { storeId })

    if (!order) {
      return {
        ok: false,
        error: storeId
          ? `No order ${trimmed} in this store — clear the store filter to search the whole workspace.`
          : `No order matches ${trimmed}.`,
      }
    }

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      storeName: order.storeName,
    }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Lookup failed',
    }
  }
}
