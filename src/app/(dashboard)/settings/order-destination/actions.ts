'use server'

/**
 * Choosing where a workspace's orders are processed.
 *
 * The switch here is the most consequential one in the dashboard: on the other
 * side of it, every order this workspace takes belongs to somebody else's
 * database and nothing on the Orders screen will act on it. So the actions are
 * deliberately granular — save the address, test it, *then* move the switch —
 * rather than one Save that does all three and leaves a merchant discovering
 * the endpoint was wrong from a customer's phone call.
 */

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  rotateOrderDestinationSecret,
  saveOrderDestination,
  setOrderRouting,
  setPurchaseReporting,
  testOrderDestination,
} from '@/server/orders'
import type { OrderRouting, PurchaseReporting } from '@/generated/prisma/enums'

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong'
}

export interface DestinationResult {
  ok: boolean
  error?: string
  /**
   * The signing secret, present only when one was just minted. Shown once and
   * never again — it is stored encrypted and there is no way to read it back.
   */
  secret?: string
  keyId?: string
  /** What the test found, when one ran. */
  check?: { ok: boolean; message: string }
}

function refresh() {
  revalidatePath('/settings/order-destination')
  revalidatePath('/orders')
}

/**
 * Saves the endpoint and immediately tries it.
 *
 * Two steps that fail for different reasons: an address that will not save is a
 * typo, and an address that saves but does not answer is a handler that is not
 * deployed yet. The save stands either way, so a merchant can paste the URL, go
 * and deploy their endpoint, and press Test.
 */
export async function saveOrderDestinationAction(
  endpointUrl: string,
  timeoutMs?: number
): Promise<DestinationResult> {
  try {
    const organizationId = await org()
    const saved = await saveOrderDestination(organizationId, {
      endpointUrl,
      timeoutMs,
    })
    const check = await testOrderDestination(organizationId)

    refresh()
    return {
      ok: true,
      secret: saved.secret ?? undefined,
      keyId: saved.keyId,
      check,
    }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function testOrderDestinationAction(): Promise<DestinationResult> {
  try {
    const check = await testOrderDestination(await org())
    refresh()
    return { ok: check.ok, check }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function setOrderRoutingAction(
  mode: OrderRouting
): Promise<DestinationResult> {
  try {
    await setOrderRouting(await org(), mode)
    refresh()
    return { ok: true }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

/**
 * Chooses who reports the Purchase.
 *
 * Its own action rather than a field on the save above, because it is its own
 * decision: a merchant fixing double-counted conversions is not editing their
 * endpoint, and making them press Save — which re-tests the endpoint and clears
 * its health — to change a reporting preference would be a strange bargain.
 */
export async function setPurchaseReportingAction(
  reporter: PurchaseReporting
): Promise<DestinationResult> {
  try {
    await setPurchaseReporting(await org(), reporter)
    refresh()
    return { ok: true }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}

export async function rotateOrderSecretAction(): Promise<DestinationResult> {
  try {
    const rotated = await rotateOrderDestinationSecret(await org())
    refresh()
    return {
      ok: true,
      secret: rotated.secret ?? undefined,
      keyId: rotated.keyId,
    }
  } catch (cause) {
    return { ok: false, error: message(cause) }
  }
}
