'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import { AuthorizationError } from '@/server/auth/rbac'
import {
  DomainError,
  addDomain,
  listDomains,
  removeDomain,
  setPrimaryDomain,
  verifyDomain,
} from '@/server/services/domainService'
import { invalidateDomainCache } from '@/server/services/siteHandleService'
import {
  FeatureLockedError,
  QuotaExceededError,
} from '@/server/services/entitlementService'
import { checkRateLimit } from '@/lib/rate-limit'

export type DomainActionState =
  { error?: string; notice?: string; upgradeNeeded?: boolean } | undefined

/**
 * Quota and feature refusals are the interesting failures here — they are the
 * whole point of the plan system, and the message a customer sees decides whether
 * they upgrade or file a bug.
 */
function toState(error: unknown, fallback: string): DomainActionState {
  if (error instanceof QuotaExceededError) {
    return { error: error.message, upgradeNeeded: true }
  }
  if (error instanceof FeatureLockedError) {
    return { error: error.message, upgradeNeeded: true }
  }
  if (error instanceof DomainError) return { error: error.message }
  if (error instanceof AuthorizationError) {
    return {
      error: 'You need admin access on this workspace to change domains.',
    }
  }
  return { error: fallback }
}

export async function addDomainAction(
  storeId: string,
  _prevState: DomainActionState,
  formData: FormData
): Promise<DomainActionState> {
  const { organization } = await getActiveOrganization()

  const hostname = formData.get('hostname')?.toString() ?? ''
  if (!hostname.trim()) return { error: 'Enter a domain name.' }

  try {
    const domain = await addDomain({
      organizationId: organization.id,
      storeId,
      hostname,
    })
    revalidatePath(`/stores/${storeId}/settings`)
    return {
      notice: `${domain.hostname} added. Add the two DNS records below, then verify.`,
    }
  } catch (error) {
    return toState(error, 'Could not add that domain.')
  }
}

export async function verifyDomainAction(
  storeId: string,
  domainId: string
): Promise<DomainActionState> {
  const { organization } = await getActiveOrganization()

  // DNS lookups are cheap but not free, and the verify button invites impatient
  // clicking while a record propagates.
  const limit = await checkRateLimit(
    `domain-verify:${organization.id}`,
    20,
    60 * 10
  )
  if (!limit.allowed) {
    return { error: 'Too many checks. Wait a minute and try again.' }
  }

  try {
    const outcome = await verifyDomain(organization.id, domainId)
    // Verification changes which hostname resolves to which store, and that
    // mapping is cached — clear it so the domain works immediately.
    const domains = await listDomains(organization.id, storeId)
    const domain = domains.find((row) => row.id === domainId)
    if (domain) await invalidateDomainCache(domain.hostname)

    revalidatePath(`/stores/${storeId}/settings`)
    return outcome.ownershipProven
      ? { notice: outcome.message }
      : { error: outcome.message }
  } catch (error) {
    return toState(error, 'Could not check that domain.')
  }
}

export async function setPrimaryDomainAction(
  storeId: string,
  domainId: string
): Promise<DomainActionState> {
  const { organization } = await getActiveOrganization()

  try {
    await setPrimaryDomain(organization.id, domainId)
    revalidatePath(`/stores/${storeId}/settings`)
    return { notice: 'Primary domain updated.' }
  } catch (error) {
    return toState(error, 'Could not set the primary domain.')
  }
}

export async function removeDomainAction(
  storeId: string,
  domainId: string
): Promise<DomainActionState> {
  const { organization } = await getActiveOrganization()

  // Read before deleting: the row is gone by the time the cache needs clearing.
  const domains = await listDomains(organization.id, storeId)
  const hostname = domains.find((row) => row.id === domainId)?.hostname

  try {
    await removeDomain(organization.id, domainId)
    if (hostname) await invalidateDomainCache(hostname)
    revalidatePath(`/stores/${storeId}/settings`)
    return { notice: 'Domain removed.' }
  } catch (error) {
    return toState(error, 'Could not remove that domain.')
  }
}
