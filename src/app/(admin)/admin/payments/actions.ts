'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { resendInvoice, runCrmJob } from '@/server/billing/crmSync'
import {
  EnfinitoPaySettingsError,
  removeEnfinitoPaySecrets,
  saveEnfinitoPaySecrets,
  testEnfinitoPayKey,
} from '@/server/services/enfinitoPaySettingsService'

export type EnfinitoPayFormState =
  { error?: string; notice?: string } | undefined

/**
 * Saves whichever of the two was pasted. The secret key is tried against
 * Enfinito Pay first, so a typo is caught here rather than by the first owner
 * who presses Pay.
 */
export async function saveEnfinitoPayAction(
  _prevState: EnfinitoPayFormState,
  formData: FormData
): Promise<EnfinitoPayFormState> {
  try {
    await saveEnfinitoPaySecrets({
      secretKey: String(formData.get('secretKey') ?? ''),
      webhookSecret: String(formData.get('webhookSecret') ?? ''),
    })
  } catch (cause) {
    if (cause instanceof EnfinitoPaySettingsError)
      return { error: cause.message }
    throw cause
  }
  revalidatePath('/admin/payments')
  return { notice: 'Saved. Workspaces pay for plans and credits online now.' }
}

export async function testEnfinitoPayAction(): Promise<{
  ok: boolean
  message: string
}> {
  const result = await testEnfinitoPayKey()
  return result.ok
    ? {
        ok: true,
        message: `Enfinito Pay accepted the key (${result.mode === 'live' ? 'live' : 'test'} mode).`,
      }
    : { ok: false, message: result.error }
}

export async function removeEnfinitoPayAction(): Promise<void> {
  await removeEnfinitoPaySecrets()
  revalidatePath('/admin/payments')
}

/** Pushes what is queued and compares every invoice with the CRM, now. */
export async function compareWithCrmAction(): Promise<{
  ok: boolean
  message: string
}> {
  await requirePlatformAdmin()
  const result = await runCrmJob({ compare: true })
  revalidatePath('/admin/payments')
  if (!result.enabled)
    return { ok: false, message: 'The CRM is not connected.' }
  if (result.error) return { ok: false, message: result.error }
  if (!result.compared)
    return {
      ok: false,
      message: 'The CRM did not answer. Try again in a minute.',
    }
  return { ok: true, message: 'Compared with the CRM.' }
}

/** Sends one invoice to the CRM again now. */
export async function resendToCrmAction(id: number): Promise<void> {
  await requirePlatformAdmin()
  if (!Number.isInteger(id) || id <= 0) return
  await resendInvoice(id)
  revalidatePath('/admin/payments')
}
