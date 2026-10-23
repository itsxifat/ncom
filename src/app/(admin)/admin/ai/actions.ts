'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  AiSettingsError,
  MAX_ACTION_COST,
  removeAiApiKey,
  saveAiApiKey,
  saveAiConfig,
  testAiApiKey,
} from '@/server/services/aiSettingsService'

export type AiKeyFormState =
  { error?: string; notice?: string; tested?: boolean } | undefined

/**
 * Saves the key — after asking Anthropic whether it works, so a typo is
 * caught here rather than by the first merchant who presses "Design".
 */
export async function saveAiKeyAction(
  _prevState: AiKeyFormState,
  formData: FormData
): Promise<AiKeyFormState> {
  const key = String(formData.get('apiKey') ?? '').trim()
  if (!key) return { error: 'Paste the API key first.' }
  const test = await testAiApiKey(key)
  if (!test.ok) return { error: test.error }
  try {
    await saveAiApiKey(key)
  } catch (cause) {
    if (cause instanceof AiSettingsError) return { error: cause.message }
    throw cause
  }
  revalidatePath('/admin/ai')
  return { notice: 'Connected. Workspaces can use the AI builder now.' }
}

export async function testAiKeyAction(): Promise<{
  ok: boolean
  message: string
}> {
  const result = await testAiApiKey()
  return result.ok
    ? { ok: true, message: 'Anthropic accepted the key.' }
    : { ok: false, message: result.error }
}

export async function removeAiKeyAction(): Promise<void> {
  await removeAiApiKey()
  revalidatePath('/admin/ai')
}

const cost = z.coerce.number().int().min(0).max(MAX_ACTION_COST)

const configSchema = z.object({
  enabled: z.boolean(),
  model: z.string().min(1).max(60),
  costs: z.object({ site: cost, page: cost, section: cost }),
})

export async function saveAiConfigAction(
  input: unknown
): Promise<{ error?: string }> {
  const parsed = configSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Credit costs are whole numbers from 0 to 1000.' }
  }
  await saveAiConfig(parsed.data)
  revalidatePath('/admin/ai')
  return {}
}
