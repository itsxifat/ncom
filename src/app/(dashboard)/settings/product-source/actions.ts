'use server'

/**
 * Connecting a workspace to the website its products live on.
 *
 * Separate from developer-actions because this is not a developer setting: it
 * is the single most important thing a merchant configures here. Without it
 * there is no catalogue, no stock and nothing to sell — every offer, every
 * order form and every storefront read goes through this connection.
 */

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  checkConnection,
  deleteConnection,
  rotateConnectionSecret,
  saveConnection,
  type CatalogIdentity,
} from '@/server/catalog'

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong'
}

export interface ConnectResult {
  ok: boolean
  error?: string
  /**
   * The shared secret, present only when one was just minted.
   *
   * Shown once and never again — it is stored encrypted and there is no way to
   * read it back. A merchant who loses it rotates rather than recovers.
   */
  secret?: string
  keyId?: string
  /** What the handshake found, when one ran. */
  check?: { ok: boolean; message: string }
}

/**
 * Saves the URL, then immediately tries it.
 *
 * Two steps rather than one because they fail for different reasons and a
 * merchant needs to tell them apart: a URL that will not save is a typo, and a
 * URL that saves but does not answer is a connector that is not deployed yet.
 * The save stands either way, so someone can paste the address, go and deploy
 * their endpoint, and press Test.
 */
export async function saveProductSourceAction(
  baseUrl: string,
  timeoutMs?: number
): Promise<ConnectResult> {
  try {
    const organizationId = await org()
    const saved = await saveConnection(organizationId, { baseUrl, timeoutMs })
    const check = await checkConnection(organizationId)

    revalidatePath('/settings/product-source')
    revalidatePath('/products')
    revalidatePath('/inventory')

    return {
      ok: true,
      secret: saved.secret ?? undefined,
      keyId: saved.keyId,
      check: check.ok
        ? { ok: true, message: describeIdentity(check.identity) }
        : { ok: false, message: check.message },
    }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function testProductSourceAction(): Promise<ConnectResult> {
  try {
    const check = await checkConnection(await org())
    revalidatePath('/settings/product-source')

    return {
      ok: check.ok,
      check: check.ok
        ? { ok: true, message: describeIdentity(check.identity) }
        : { ok: false, message: check.message },
    }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function rotateProductSourceSecretAction(): Promise<ConnectResult> {
  try {
    const rotated = await rotateConnectionSecret(await org())
    revalidatePath('/settings/product-source')
    return {
      ok: true,
      secret: rotated.secret ?? undefined,
      keyId: rotated.keyId,
    }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function disconnectProductSourceAction(): Promise<ConnectResult> {
  try {
    await deleteConnection(await org())
    revalidatePath('/settings/product-source')
    revalidatePath('/products')
    return { ok: true }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

function describeIdentity(identity: CatalogIdentity): string {
  const optional = (
    ['search', 'categories', 'reserve', 'release'] as const
  ).filter((name) => identity.capabilities[name])

  const parts = [identity.platform ?? 'Connected']
  if (identity.currency) parts.push(`prices in ${identity.currency}`)
  parts.push(
    optional.length > 0
      ? `also implements ${optional.join(', ')}`
      : 'products and stock only'
  )

  return parts.join(' · ')
}
