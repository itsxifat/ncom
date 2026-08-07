'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import { updateProjectTheme } from '@/server/services/projectService'
import { updateThemeSchema } from '@/lib/validation/theme'

export type ThemeActionState = { error?: string; success?: string } | undefined

export async function updateThemeAction(
  projectId: string,
  _prevState: ThemeActionState,
  formData: FormData
): Promise<ThemeActionState> {
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
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()
  await updateProjectTheme(organization.id, projectId, parsed.data)

  revalidatePath(`/projects/${projectId}/theme`)
  return { success: 'Theme updated.' }
}
