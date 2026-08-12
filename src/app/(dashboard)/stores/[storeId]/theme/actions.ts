'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import { updateStoreTheme } from '@/server/services/storeService'
import { updateThemeSchema, type ThemeFormState } from '@/lib/validation/theme'

export async function updateThemeAction(
  storeId: string,
  _prevState: ThemeFormState,
  formData: FormData
): Promise<ThemeFormState> {
  const parsed = updateThemeSchema.safeParse({
    primaryColor: formData.get('primaryColor'),
    secondaryColor: formData.get('secondaryColor'),
    backgroundColor: formData.get('backgroundColor'),
    textColor: formData.get('textColor'),
    headingFont: formData.get('headingFont'),
    bodyFont: formData.get('bodyFont'),
    buttonStyle: formData.get('buttonStyle'),
    borderRadius: formData.get('borderRadius'),
    spacingScale: formData.get('spacingScale'),
    containerWidth: formData.get('containerWidth'),
    logoUrl: formData.get('logoUrl') || null,
    faviconUrl: formData.get('faviconUrl') || null,
    logoWidth: Number(formData.get('logoWidth')) || 140,
    headingWeight: formData.get('headingWeight') || '600',
    bodyScale: formData.get('bodyScale') || '1',
    sectionSpacing: formData.get('sectionSpacing') || 'comfortable',
    showStickyHeader: formData.get('showStickyHeader') === 'on',
    customCss: formData.get('customCss') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()
  await updateStoreTheme(organization.id, storeId, parsed.data)

  revalidatePath(`/stores/${storeId}/theme`)
  return { success: 'Theme updated.' }
}
