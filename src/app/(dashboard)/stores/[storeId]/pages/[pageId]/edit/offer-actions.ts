'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createOffer,
  deleteOffer,
  listOffers,
  savePageCheckout,
  updateOffer,
  type OfferInput,
  type PageCheckoutInput,
} from '@/server/services/offerAdminService'

/**
 * The builder's Offers tab, server side.
 *
 * Thin by design: every rule about what an offer may contain, who may edit it
 * and when the published snapshot has to be recompiled lives in
 * offerAdminService. These only resolve the caller's organisation — which the
 * browser must never supply — and hand over.
 */

function pagePath(storeId: string, pageId: string) {
  return `/stores/${storeId}/pages/${pageId}/edit`
}

export async function listOffersAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  return listOffers(organization.id, storeId, pageId)
}

export type OfferActionResult = { ok: true } | { ok: false; error: string }

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
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : 'Could not save the offer',
    }
  }

  revalidatePath(pagePath(storeId, pageId))
  return { ok: true }
}

export async function deleteOfferAction(
  storeId: string,
  pageId: string,
  offerId: string
): Promise<OfferActionResult> {
  const { organization } = await getActiveOrganization()

  try {
    await deleteOffer(organization.id, storeId, pageId, offerId)
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : 'Could not delete the offer',
    }
  }

  revalidatePath(pagePath(storeId, pageId))
  return { ok: true }
}

export async function saveCheckoutAction(
  storeId: string,
  pageId: string,
  input: PageCheckoutInput
): Promise<OfferActionResult> {
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
