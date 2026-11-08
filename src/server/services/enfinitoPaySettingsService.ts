import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db/client'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto'
import { checkSecretKey, keyMode } from '@/server/billing/enfinitoPay'
import { logAudit } from './auditService'

/**
 * Which Enfinito Pay product NCOM bills its workspaces through: the product's
 * secret key (`sk_test_…` or `sk_live_…`) and its webhook signing secret
 * (`whsec_…`), both created in the Enfinito Pay admin.
 *
 * Set by the platform team in Admin → Payments and stored in PlatformSetting,
 * encrypted (lib/crypto); neither ever goes back to a browser — the admin page
 * is shown their last four characters. `ENFINITO_PAY_SECRET_KEY` and
 * `ENFINITO_PAY_WEBHOOK_SECRET` in the environment still work, for a
 * deployment set up that way, and are used only for what was not saved here.
 *
 * Without a secret key nothing paid can be bought online: paid orders wait for
 * the team, as they did before NCOM took payments.
 */

const SETTING = 'payments.enfinitoPay'

interface StoredSecret {
  ciphertext: string
  preview: string
}

interface Stored {
  secretKey?: StoredSecret
  webhookSecret?: StoredSecret
  savedAt?: string
}

export class EnfinitoPaySettingsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnfinitoPaySettingsError'
  }
}

const readStored = cache(async (): Promise<Stored> => {
  const row = await prisma.platformSetting.findUnique({
    where: { key: SETTING },
  })
  const value = (row?.value ?? {}) as Record<string, unknown>
  const secret = (raw: unknown): StoredSecret | undefined => {
    const entry = raw as Partial<StoredSecret> | null | undefined
    return entry && typeof entry.ciphertext === 'string'
      ? { ciphertext: entry.ciphertext, preview: String(entry.preview ?? '') }
      : undefined
  }
  return {
    secretKey: secret(value.secretKey),
    webhookSecret: secret(value.webhookSecret),
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : undefined,
  }
})

function fromEnvironment(name: string): string | null {
  return process.env[name]?.trim() || null
}

/** A saved secret, decrypted — or null when it can no longer be (AUTH_SECRET changed). */
function open(secret: StoredSecret | undefined, label: string): string | null {
  if (!secret) return null
  try {
    return decryptSecret(secret.ciphertext)
  } catch (cause) {
    console.error(
      `[billing] the saved Enfinito Pay ${label} could not be decrypted`,
      cause
    )
    return null
  }
}

export interface EnfinitoPayCredentials {
  secretKey: string
  /** Null until one is set: payments still work, confirmed on the owner's return. */
  webhookSecret: string | null
  mode: 'test' | 'live'
}

/** What NCOM bills with, or null when online payment is not set up. */
export async function getEnfinitoPayCredentials(): Promise<EnfinitoPayCredentials | null> {
  const stored = await readStored()
  const secretKey =
    open(stored.secretKey, 'secret key') ??
    fromEnvironment('ENFINITO_PAY_SECRET_KEY')
  if (!secretKey) return null
  const webhookSecret =
    open(stored.webhookSecret, 'webhook secret') ??
    fromEnvironment('ENFINITO_PAY_WEBHOOK_SECRET')
  return { secretKey, webhookSecret, mode: keyMode(secretKey) }
}

/** Whether a workspace can pay online right now. */
export async function onlinePaymentAvailable(): Promise<boolean> {
  return (await getEnfinitoPayCredentials()) !== null
}

export interface EnfinitoPayStatus {
  secretKey: SecretStatus
  webhookSecret: SecretStatus
  mode: 'test' | 'live' | null
  savedAt: string | null
}

interface SecretStatus {
  source: 'admin' | 'environment' | null
  preview: string | null
}

export async function getEnfinitoPayStatus(): Promise<EnfinitoPayStatus> {
  const stored = await readStored()
  const status = (
    saved: StoredSecret | undefined,
    env: string
  ): SecretStatus => {
    if (saved) return { source: 'admin', preview: saved.preview }
    const value = fromEnvironment(env)
    return value
      ? { source: 'environment', preview: maskSecret(value) }
      : { source: null, preview: null }
  }
  const credentials = await getEnfinitoPayCredentials()
  return {
    secretKey: status(stored.secretKey, 'ENFINITO_PAY_SECRET_KEY'),
    webhookSecret: status(stored.webhookSecret, 'ENFINITO_PAY_WEBHOOK_SECRET'),
    mode: credentials?.mode ?? null,
    savedAt: stored.savedAt ?? null,
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

const SECRET_KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9_-]{8,}$/
const WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9_-]{8,}$/

/**
 * Saves either or both. A secret key is tried against Enfinito Pay first, so
 * a typo is caught here rather than by the first owner who presses "Pay".
 */
export async function saveEnfinitoPaySecrets(input: {
  secretKey?: string
  webhookSecret?: string
}): Promise<void> {
  const session = await requirePlatformAdmin()
  const secretKey = input.secretKey?.trim()
  const webhookSecret = input.webhookSecret?.trim()
  if (!secretKey && !webhookSecret) {
    throw new EnfinitoPaySettingsError(
      'Paste a secret key or a webhook secret.'
    )
  }
  if (secretKey) {
    if (!SECRET_KEY_PATTERN.test(secretKey)) {
      throw new EnfinitoPaySettingsError(
        'That does not look like an Enfinito Pay secret key. It starts with “sk_test_” or “sk_live_”.'
      )
    }
    const check = await checkSecretKey(secretKey)
    if (!check.ok) throw new EnfinitoPaySettingsError(check.error)
  }
  if (webhookSecret && !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) {
    throw new EnfinitoPaySettingsError(
      'That does not look like a webhook signing secret. It starts with “whsec_”.'
    )
  }

  const stored = await readStored()
  const seal = (value: string): StoredSecret => ({
    ciphertext: encryptSecret(value),
    preview: maskSecret(value),
  })
  const kept = {
    secretKey: secretKey ? seal(secretKey) : stored.secretKey,
    webhookSecret: webhookSecret ? seal(webhookSecret) : stored.webhookSecret,
  }
  // Only what there is: a JSON column has no "undefined".
  const value = {
    ...(kept.secretKey && { secretKey: { ...kept.secretKey } }),
    ...(kept.webhookSecret && { webhookSecret: { ...kept.webhookSecret } }),
    savedAt: new Date().toISOString(),
  }
  await prisma.platformSetting.upsert({
    where: { key: SETTING },
    create: { key: SETTING, value },
    update: { value },
  })
  // The secrets themselves are never written to the audit log, not even masked.
  await logAudit(
    session.user.id,
    'billing.enfinitoPay.saved',
    'PlatformSetting',
    SETTING,
    {
      secretKey: Boolean(secretKey),
      webhookSecret: Boolean(webhookSecret),
      mode: secretKey ? keyMode(secretKey) : null,
    }
  )
}

export async function removeEnfinitoPaySecrets(): Promise<void> {
  const session = await requirePlatformAdmin()
  await prisma.platformSetting.deleteMany({ where: { key: SETTING } })
  await logAudit(
    session.user.id,
    'billing.enfinitoPay.removed',
    'PlatformSetting',
    SETTING
  )
}

/** Tries the key in use against Enfinito Pay. */
export async function testEnfinitoPayKey(): Promise<
  { ok: true; mode: 'test' | 'live' } | { ok: false; error: string }
> {
  await requirePlatformAdmin()
  const credentials = await getEnfinitoPayCredentials()
  if (!credentials) return { ok: false, error: 'There is no secret key yet.' }
  const check = await checkSecretKey(credentials.secretKey)
  return check.ok ? { ok: true, mode: credentials.mode } : check
}
