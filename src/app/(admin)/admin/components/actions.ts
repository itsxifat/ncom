'use server'

import { revalidatePath } from 'next/cache'
import { toggleComponentDefinitionActive } from '@/server/services/adminService'

export async function toggleComponentDefinitionActiveAction(id: string) {
  await toggleComponentDefinitionActive(id)
  revalidatePath('/admin/components')
}
