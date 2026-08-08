'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import { updatePageSeo } from '@/server/services/pageService'
import { updatePageSeoSchema } from '@/lib/validation/page'

export type SeoFormState = { error?: string; success?: string } | undefined

export async function updatePageSeoAction(
  projectId: string,
  pageId: string,
  _prevState: SeoFormState,
  formData: FormData
): Promise<SeoFormState> {
  const parsed = updatePageSeoSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    seoTitle: formData.get('seoTitle') || undefined,
    seoDescription: formData.get('seoDescription') || undefined,
    ogImageMediaId: formData.get('ogImageMediaId') || undefined,
    robotsIndex: formData.get('robotsIndex') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await updatePageSeo(organization.id, projectId, pageId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/projects/${projectId}/pages/${pageId}/settings`)
  revalidatePath(`/projects/${projectId}`)
  return { success: 'Saved.' }
}
