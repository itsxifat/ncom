'use server'

import { revalidatePath } from 'next/cache'
import { forceUnpublishStore } from '@/server/services/adminService'

export async function forceUnpublishStoreAction(storeId: string) {
  await forceUnpublishStore(storeId)
  revalidatePath('/admin/stores')
}
