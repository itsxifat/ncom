import 'server-only'
import { cache } from 'react'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/server/db/client'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto'
import { logAudit } from './auditService'

/**
 * The AI builder's platform settings: whose Claude account it runs on, which
 * model it uses, and what each kind of request costs a workspace in credits.
 *
 * Set by the platform team in the admin panel (Admin → AI builder), never by a
 * workspace, and stored in the PlatformSetting table beside the platform's
 * other switches. The API key is encrypted at rest (lib/crypto) and never
 * leaves the server again: the admin page is shown its last four characters.
 * `ANTHROPIC_API_KEY` in the environment still works, for a deployment set up
 * that way, and is used only when no key was saved here — the admin page says
 * which one is in use.
 *
 * Merchants never see any of this. A workspace either has the AI builder or
 * does not see it; it is never told the platform has not been set up.
 */

const KEY_SETTING = 'ai.apiKey'
const CONFIG_SETTING = 'ai.config'

/** The models the admin can choose between, best first. */
export const AI_MODELS = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    hint: 'The best designs. Recommended.',
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    hint: 'Faster and cheaper, good designs.',
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    hint: 'Fastest and cheapest, simpler designs.',
  },
] as const

export type AiAction = 'site' | 'page' | 'section'

export const AI_ACTION_LABELS: Record<AiAction, string> = {
  site: 'Design a whole site',
  page: 'Write or change a page',
  section: 'Change one section',
}

export interface AiConfig {
  /** Off hides the AI builder from every workspace, key or no key. */
  enabled: boolean
  model: string
  /** Credits each kind of request takes from a workspace. */
  costs: Record<AiAction, number>
}

/**
 * Prices in credits, roughly in proportion to what each request costs in
 * Claude usage: a whole store is many times a page, a page several sections.
 */
const DEFAULT_CONFIG: AiConfig = {
  enabled: true,
  model: AI_MODELS[0].id,
  costs: { site: 10, page: 4, section: 1 },
}

export const MAX_ACTION_COST = 1000

interface StoredKey {
  ciphertext: string
  preview: string
  savedAt: string
}

export class AiSettingsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiSettingsError'
  }
}

/** The settings, with a default for anything never saved or saved wrong. */
export const getAiConfig = cache(async (): Promise<AiConfig> => {
  const row = await prisma.platformSetting.findUnique({
    where: { key: CONFIG_SETTING },
  })
  return readConfig(row?.value)
})

function readConfig(value: unknown): AiConfig {
  const saved =
    value && typeof value === 'object' ? (value as Partial<AiConfig>) : {}
  const costs: Partial<Record<AiAction, unknown>> =
    saved.costs && typeof saved.costs === 'object' ? saved.costs : {}
  const cost = (action: AiAction) => {
    const n = Number(costs[action])
    return Number.isInteger(n) && n >= 0 && n <= MAX_ACTION_COST
      ? n
      : DEFAULT_CONFIG.costs[action]
  }
  return {
    enabled:
      typeof saved.enabled === 'boolean'
        ? saved.enabled
        : DEFAULT_CONFIG.enabled,
    model: AI_MODELS.some((model) => model.id === saved.model)
      ? saved.model!
      : DEFAULT_CONFIG.model,
    costs: { site: cost('site'), page: cost('page'), section: cost('section') },
  }
}

const readStoredKey = cache(async (): Promise<StoredKey | null> => {
  const row = await prisma.platformSetting.findUnique({
    where: { key: KEY_SETTING },
  })
  const value = row?.value as Partial<StoredKey> | null | undefined
  return value && typeof value.ciphertext === 'string'
    ? {
        ciphertext: value.ciphertext,
        preview: String(value.preview ?? ''),
        savedAt: String(value.savedAt ?? ''),
      }
    : null
})

function environmentKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null
}

/**
 * The key the AI builder calls Claude with: the one saved in the admin panel,
 * else the environment's. Null when there is neither, or when the saved one
 * can no longer be decrypted (AUTH_SECRET changed) — which is logged, because
 * an admin will want to know why the AI builder vanished.
 */
export async function getAiApiKey(): Promise<string | null> {
  const stored = await readStoredKey()
  if (stored) {
    try {
      return decryptSecret(stored.ciphertext)
    } catch (cause) {
      console.error(
        '[ai] the saved Anthropic API key could not be decrypted',
        cause
      )
      return environmentKey()
    }
  }
  return environmentKey()
}

export interface AiKeyStatus {
  /** Where the key in use comes from, or null when there is none. */
  source: 'admin' | 'environment' | null
  /** Its last four characters, for recognising it. */
  preview: string | null
  savedAt: string | null
}

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  const stored = await readStoredKey()
  if (stored) {
    return { source: 'admin', preview: stored.preview, savedAt: stored.savedAt }
  }
  const env = environmentKey()
  return env
    ? { source: 'environment', preview: maskSecret(env), savedAt: null }
    : { source: null, preview: null, savedAt: null }
}

/** Whether workspaces have the AI builder right now: switched on, with a key. */
export async function aiBuilderAvailable(): Promise<boolean> {
  const [config, key] = await Promise.all([getAiConfig(), getAiApiKey()])
  return config.enabled && key !== null
}

// ── Admin ────────────────────────────────────────────────────────────────

/** Anthropic keys start like this; anything else is a paste of something else. */
const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/

export async function saveAiApiKey(key: string): Promise<void> {
  const session = await requirePlatformAdmin()
  const trimmed = key.trim()
  if (!KEY_PATTERN.test(trimmed)) {
    throw new AiSettingsError(
      'That does not look like an Anthropic API key. It starts with “sk-ant-”.'
    )
  }
  const value: StoredKey = {
    ciphertext: encryptSecret(trimmed),
    preview: maskSecret(trimmed),
    savedAt: new Date().toISOString(),
  }
  await prisma.platformSetting.upsert({
    where: { key: KEY_SETTING },
    create: { key: KEY_SETTING, value: { ...value } },
    update: { value: { ...value } },
  })
  // The key itself is never written to the audit log, not even masked.
  await logAudit(
    session.user.id,
    'ai.key.saved',
    'PlatformSetting',
    KEY_SETTING
  )
}

export async function removeAiApiKey(): Promise<void> {
  const session = await requirePlatformAdmin()
  await prisma.platformSetting.deleteMany({ where: { key: KEY_SETTING } })
  await logAudit(
    session.user.id,
    'ai.key.removed',
    'PlatformSetting',
    KEY_SETTING
  )
}

export async function saveAiConfig(input: AiConfig): Promise<void> {
  const session = await requirePlatformAdmin()
  const config = readConfig(input)
  await prisma.platformSetting.upsert({
    where: { key: CONFIG_SETTING },
    create: { key: CONFIG_SETTING, value: { ...config } },
    update: { value: { ...config } },
  })
  await logAudit(
    session.user.id,
    'ai.config.saved',
    'PlatformSetting',
    CONFIG_SETTING,
    { ...config }
  )
}

/**
 * Asks Anthropic whether a key works — the one given, or the one in use.
 *
 * Lists models rather than sending a message: it proves the key is accepted
 * and costs nothing.
 */
export async function testAiApiKey(
  candidate?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  const key = candidate?.trim() || (await getAiApiKey())
  if (!key) return { ok: false, error: 'There is no key to test yet.' }
  try {
    await new Anthropic({
      apiKey: key,
      maxRetries: 0,
      timeout: 15_000,
    }).models.list({
      limit: 1,
    })
    return { ok: true }
  } catch (cause) {
    if (cause instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        error:
          'Anthropic refused this key. Check it was copied whole, and that it is still active.',
      }
    }
    if (cause instanceof Anthropic.PermissionDeniedError) {
      return {
        ok: false,
        error:
          'This key is not allowed to use the API. Check its workspace in the Anthropic Console.',
      }
    }
    if (cause instanceof Anthropic.APIConnectionError) {
      return {
        ok: false,
        error:
          'Anthropic could not be reached from this server. Try again in a minute.',
      }
    }
    console.error('[ai] testing the API key failed', cause)
    return { ok: false, error: 'The test failed. Try again in a minute.' }
  }
}
