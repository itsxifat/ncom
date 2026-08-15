'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createStore,
  deleteStore,
  duplicateStore,
  getStore,
  updateStore,
  updateStoreIntegration,
} from '@/server/services/storeService'
import { sendTrackingTestEvent } from '@/server/services/trackingService'
import { env } from '@/lib/env'
import { createPage, deletePage } from '@/server/services/pageService'
import { publishPage, unpublishPage } from '@/server/services/publishService'
import {
  createStoreSchema,
  updateStoreSchema,
} from '@/lib/validation/store-core'
import { createPageSchema } from '@/lib/validation/page'
import { updateIntegrationSchema } from '@/lib/validation/integration'

export type FormActionState = { error?: string } | undefined

export async function createStoreAction(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createStoreSchema.safeParse({
    name: formData.get('name'),
    subdomain: formData.get('subdomain') || undefined,
    currencyCode: formData.get('currencyCode') || 'USD',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  let store
  try {
    store = await createStore(organization.id, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath('/stores')
  redirect(`/stores/${store.id}`)
}

export async function updateStoreAction(
  storeId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = updateStoreSchema.safeParse({
    name: formData.get('name') || undefined,
    subdomain: formData.get('subdomain') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await updateStore(organization.id, storeId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/stores/${storeId}`)
  revalidatePath(`/stores/${storeId}/settings`)
  return { error: undefined }
}

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

export async function updateStoreIntegrationAction(
  storeId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
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

  revalidatePath(`/stores/${storeId}/settings`)
  return { error: undefined }
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

    return { results }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }
}

export async function deleteStoreAction(storeId: string) {
  const { organization } = await getActiveOrganization()
  await deleteStore(organization.id, storeId)
  revalidatePath('/stores')
}

export async function duplicateStoreAction(storeId: string) {
  const { organization } = await getActiveOrganization()
  await duplicateStore(organization.id, storeId)
  revalidatePath('/stores')
}

export async function createPageAction(
  storeId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createPageSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await createPage(organization.id, storeId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/stores/${storeId}`)
  redirect(`/stores/${storeId}`)
}

export async function deletePageAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  await deletePage(organization.id, storeId, pageId)
  revalidatePath(`/stores/${storeId}`)
}

export async function publishPageAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  await publishPage(organization.id, storeId, pageId)
  revalidatePath(`/stores/${storeId}`)
}

export async function unpublishPageAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  await unpublishPage(organization.id, storeId, pageId)
  revalidatePath(`/stores/${storeId}`)
}
