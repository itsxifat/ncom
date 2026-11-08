'use server'

import { revalidatePath } from 'next/cache'
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
