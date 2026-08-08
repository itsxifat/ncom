'use server'

import { revalidatePath } from 'next/cache'
import { forceUnpublishProject } from '@/server/services/adminService'

export async function forceUnpublishProjectAction(projectId: string) {
  await forceUnpublishProject(projectId)
  revalidatePath('/admin/projects')
}
