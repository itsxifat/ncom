'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import type { DomainStatus } from '@/generated/prisma/enums'
import { setDomainStatusAsAdmin } from '@/server/services/domainService'
import { invalidateDomainCache } from '@/server/services/siteHandleService'

export async function setDomainStatusAction(
  domainId: string,
  hostname: string,
  status: DomainStatus
): Promise<{ error?: string }> {
  const session = await requirePlatformAdmin()

  try {
    await setDomainStatusAsAdmin(session.user.id, domainId, status)
    // The hostname -> store mapping is cached for a minute; forcing a status
    // should take effect now, not when the TTL happens to expire.
    await invalidateDomainCache(hostname)
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not update the domain.',
    }
  }

  revalidatePath('/admin/domains')
  return {}
}
