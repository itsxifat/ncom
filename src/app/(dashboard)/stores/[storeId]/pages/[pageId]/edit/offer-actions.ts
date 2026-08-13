'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createOffer,
  deleteOffer,
  listOffers,
  reorderOffers,
  savePageCheckout,
  updateOffer,
  type OfferInput,
  type OfferSummaryRow,
  type PageCheckoutInput,
} from '@/server/services/offerAdminService'

/**
 * The builder's Offers tab, server side.
 *
 * Thin by design: every rule about what an offer may contain, who may edit it
 * and when the published snapshot has to be recompiled lives in
 * offerAdminService. These only resolve the caller's organisation — which the
 * browser must never supply — and hand over.
 *
 * Every mutation answers with the page's offers as they now stand. The panel is
 * a client component holding its own list, so without that a newly created
 * offer would sit in the browser with no id and the next save would create a
 * *second* offer instead of editing the first. Returning the list also keeps
 * positions and the single preselected offer in step with what the server
 * decided rather than with what the browser guessed.
 */

function pagePath(storeId: string, pageId: string) {
  return `/stores/${storeId}/pages/${pageId}/edit`
}

export type OfferActionResult =
  { ok: true; offers: OfferSummaryRow[] } | { ok: false; error: string }

export type CheckoutActionResult = { ok: true } | { ok: false; error: string }

export async function listOffersAction(
  storeId: string,
  pageId: string
): Promise<OfferSummaryRow[]> {
  const { organization } = await getActiveOrganization()
  return listOffers(organization.id, storeId, pageId)
}

export async function saveOfferAction(
  storeId: string,
  pageId: string,
  offerId: string | null,
  input: OfferInput
): Promise<OfferActionResult> {
  const { organization } = await getActiveOrganization()

  try {
    if (offerId) {
      await updateOffer(organization.id, storeId, pageId, offerId, input)
    } else {
      await createOffer(organization.id, storeId, pageId, input)
    }

    const offers = await listOffers(organization.id, storeId, pageId)
    revalidatePath(pagePath(storeId, pageId))
    return { ok: true, offers }
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : 'Could not save the offer',
    }
  }
}

export async function deleteOfferAction(
  storeId: string,
  pageId: string,
  offerId: string
): Promise<OfferActionResult> {
  const { organization } = await getActiveOrganization()

  try {
    await deleteOffer(organization.id, storeId, pageId, offerId)

    const offers = await listOffers(organization.id, storeId, pageId)
    revalidatePath(pagePath(storeId, pageId))
    return { ok: true, offers }
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : 'Could not delete the offer',
    }
  }
}

/**
 * Persists the order the merchant dragged the offers into.
 *
 * The buyer sees them in this order and the first one is what the form
 * preselects when no offer is marked as the default, so this is a merchandising
 * decision, not a cosmetic one.
 */
export async function reorderOffersAction(
  storeId: string,
  pageId: string,
  orderedIds: string[]
): Promise<OfferActionResult> {
  const { organization } = await getActiveOrganization()

  try {
    await reorderOffers(organization.id, storeId, pageId, orderedIds)

    const offers = await listOffers(organization.id, storeId, pageId)
    revalidatePath(pagePath(storeId, pageId))
    return { ok: true, offers }
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : 'Could not reorder the offers',
    }
  }
}

export async function saveCheckoutAction(
  storeId: string,
  pageId: string,
  input: PageCheckoutInput
): Promise<CheckoutActionResult> {
  const { organization } = await getActiveOrganization()

  try {
    await savePageCheckout(organization.id, storeId, pageId, input)
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error
          ? cause.message
          : 'Could not save the delivery settings',
    }
  }

  revalidatePath(pagePath(storeId, pageId))
  return { ok: true }
}
