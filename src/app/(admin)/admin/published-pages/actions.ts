'use server'

import { revalidatePath } from 'next/cache'
import { forceUnpublishPage } from '@/server/services/adminService'

export async function forceUnpublishPageAction(pageId: string) {
  await forceUnpublishPage(pageId)
  revalidatePath('/admin/published-pages')
}
