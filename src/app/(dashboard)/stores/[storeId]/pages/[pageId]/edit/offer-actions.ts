'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  savePageCheckout,
  type PageCheckoutInput,
} from '@/server/services/offerAdminService'

/**
 * The builder's Delivery tab, server side.
 *
 * Thin by design: every rule about what a page may charge lives in
 * offerAdminService. This only resolves the caller's organisation — which the
 * browser must never supply — and hands over.
 *
 * Offers are no longer edited from here. They belong to the workspace and are
 * managed under Discounts & offers, because a bundle scoped to a whole store
 * has no single page to be edited from.
 */

function pagePath(storeId: string, pageId: string) {
  return `/stores/${storeId}/pages/${pageId}/edit`
}

export type CheckoutActionResult = { ok: true } | { ok: false; error: string }

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
