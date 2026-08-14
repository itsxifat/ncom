'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createStore,
  deleteStore,
  duplicateStore,
  updateStore,
  updateStoreIntegration,
} from '@/server/services/storeService'
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
