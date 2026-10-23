'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { prisma } from '@/server/db/client'
import {
  createStore,
  deleteStore,
  duplicateStore,
  updateStore,
} from '@/server/services/storeService'
import { createPage, deletePage } from '@/server/services/pageService'
import {
  publishPageAndTheme,
  unpublishPage,
} from '@/server/services/publishService'
import {
  createStoreSchema,
  updateStoreSchema,
} from '@/lib/validation/store-core'
import { createPageSchema } from '@/lib/validation/page'
import { getPageStarter } from '@/modules/templates/page-starters'
import {
  discardSiteDraft,
  loadSiteDraft,
} from '@/server/services/designDraftService'

export type FormActionState = { error?: string } | undefined

export async function createStoreAction(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createStoreSchema.safeParse({
    name: formData.get('name'),
    subdomain: formData.get('subdomain') || undefined,
    currencyCode: formData.get('currencyCode') || 'BDT',
    kind: formData.get('kind') || 'LANDING',
    templateKey: formData.get('templateKey') || undefined,
    language: formData.get('language') || 'en',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  // A design made for this site — by the AI builder or pasted from the
  // merchant's own AI — waits as a draft until now. Its kind and language are
  // the ones it was designed for, whatever the form says.
  const draftId = formData.get('draftId')
  const draft =
    typeof draftId === 'string' && draftId
      ? await loadSiteDraft(organization.id, draftId)
      : null
  if (draftId && !draft) {
    return {
      error: 'This design has expired. Go back and make it again.',
    }
  }
  const input = draft
    ? { ...parsed.data, kind: draft.kind, language: draft.language }
    : parsed.data

  let store
  try {
    store = await createStore(organization.id, input, draft?.template)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }
  if (draft && typeof draftId === 'string') await discardSiteDraft(draftId)

  revalidatePath('/stores')

  // Straight into the builder on the new home page: the merchant chose a
  // design to start editing it, and a stop at an overview page first is one
  // more screen between them and the thing they came to do.
  const home = await prisma.page.findFirst({
    where: { storeId: store.id, isHome: true },
    select: { id: true },
  })
  redirect(
    home ? `/stores/${store.id}/pages/${home.id}/edit` : `/stores/${store.id}`
  )
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
  const starter = getPageStarter(String(formData.get('starter') ?? 'blank'))

  let pageId: string
  try {
    const page = await createPage(
      organization.id,
      storeId,
      // The starter goes along so a blank "Web address" means its address.
      { ...parsed.data, starter },
      starter.sections
    )
    pageId = page.id
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/stores/${storeId}`)
  revalidatePath('/stores')
  // Into the builder on the new page: it was made to be edited.
  redirect(`/stores/${storeId}/pages/${pageId}/edit`)
}

export async function deletePageAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  await deletePage(organization.id, storeId, pageId)
  revalidatePath(`/stores/${storeId}`)
}

export async function publishPageAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  // With the theme, as the builder's Publish does: the language and colours
  // the merchant drafted beside this page go live with it.
  await publishPageAndTheme(organization.id, storeId, pageId)
  revalidatePath(`/stores/${storeId}`)
}

export async function unpublishPageAction(storeId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  await unpublishPage(organization.id, storeId, pageId)
  revalidatePath(`/stores/${storeId}`)
}
