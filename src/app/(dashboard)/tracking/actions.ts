'use server'

/**
 * Tracking setup, for every store in the workspace.
 *
 * These used to live beside the store actions, because tracking used to be
 * edited inside one store's settings. It is a workspace-level job — one ad
 * account, several landing pages, one person checking on Monday morning
 * whether any of them stopped reporting — so the actions moved with the screen
 * that does it.
 */

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getStore,
  updateStoreIntegration,
} from '@/server/services/storeService'
import { sendTrackingTestEvent } from '@/server/services/trackingService'
import { updateIntegrationSchema } from '@/lib/validation/integration'
import { env } from '@/lib/env'

export type TrackingFormState = { error?: string; success?: string } | undefined

/**
 * Reads a masked credential field.
 *
 * Absent from the payload entirely means the form did not render it, so there
 * is nothing to say about it; present-but-empty means the merchant cleared it.
 * The two must not collapse into one value — see `updateStoreIntegration`.
 */
function readSecretField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name)
  return value === null ? undefined : String(value)
}

export async function saveStoreTrackingAction(
  storeId: string,
  _prevState: TrackingFormState,
  formData: FormData
): Promise<TrackingFormState> {
  const parsed = updateIntegrationSchema.safeParse({
    gaMeasurementId: formData.get('gaMeasurementId') || undefined,
    gtmContainerId: formData.get('gtmContainerId') || undefined,
    metaPixelId: formData.get('metaPixelId') || undefined,
    customHeadScript: formData.get('customHeadScript') || undefined,
    metaTestEventCode: formData.get('metaTestEventCode') || undefined,
    // Not coalesced to `undefined` like the others: an empty secret box is a
    // merchant switching server-side tracking off, and it has to survive as an
    // empty string for `updateStoreIntegration` to tell that apart from a field
    // they simply did not touch.
    metaAccessToken: readSecretField(formData, 'metaAccessToken'),
    ga4ApiSecret: readSecretField(formData, 'ga4ApiSecret'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await updateStoreIntegration(organization.id, storeId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath('/tracking')
  // The published storefront renders these tags, so its cached HTML is stale
  // the moment they change.
  revalidatePath(`/stores/${storeId}`)
  return { success: 'Saved. Send a test event to confirm it works.' }
}

export type TrackingTestState =
  | { results: { destination: 'meta' | 'ga4'; ok: boolean; message: string }[] }
  | { error: string }
  | undefined

/**
 * Sends a throwaway event to whichever destinations this store has configured
 * and reports what each said.
 *
 * Worth an action of its own because neither platform will tell a merchant they
 * got it wrong during normal operation: Meta accepts a well-formed event
 * against a pixel that is not theirs, and GA4 answers 204 to everything it is
 * ever sent, valid or not. Without this button, a mistyped API secret looks
 * exactly like a working setup until a month of empty reports comes back.
 */
export async function sendTrackingTestEventAction(
  storeId: string
): Promise<TrackingTestState> {
  const { organization } = await getActiveOrganization()

  try {
    const store = await getStore(organization.id, storeId)
    const results = await sendTrackingTestEvent(
      organization.id,
      store.id,
      `https://${store.subdomain}.${env.ROOT_DOMAIN}/`
    )

    if (results.length === 0) {
      return {
        error:
          'Nothing to test yet — add a Meta access token or a GA4 API secret first.',
      }
    }

    // Deliberately not logged to TrackingDelivery, and so nothing to
    // revalidate: a probe the merchant fired by hand is not a conversion, and
    // counting it would move the delivery rate the page reports beside it.
    return { results }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }
}
