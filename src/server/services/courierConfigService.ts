import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto'
import { SteadfastClient } from '@/server/courier/steadfast'
import { PathaoClient, type PathaoStore } from '@/server/courier/pathao'
import {
  CourierNotConfiguredError,
  type CourierClient,
} from '@/server/courier/types'
import type { CourierProvider } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Courier accounts: storing the credentials, proving they work, and handing
 * back a ready client.
 *
 * Two rules govern everything here.
 *
 * Secrets go in encrypted and never come back out. `credentials` is written
 * through lib/crypto and is only ever decrypted inside this module, on the way
 * into a client. Every function that returns something to a page or an action
 * returns masked previews — there is no code path that sends a stored courier
 * password to a browser, which is what makes "the merchant can see their own
 * settings" safe.
 *
 * Blank means unchanged. A settings form cannot render a secret it is not
 * allowed to read, so it renders an empty box; submitting that box must not
 * wipe the stored key. Every save merges into what is already there.
 */

/** Which fields each provider needs, and which of them are secret. */
export const COURIER_FIELDS = {
  STEADFAST: [
    { key: 'apiKey', label: 'API key', secret: false, required: true },
    { key: 'secretKey', label: 'Secret key', secret: true, required: true },
  ],
  PATHAO: [
    { key: 'clientId', label: 'Client ID', secret: false, required: true },
    {
      key: 'clientSecret',
      label: 'Client secret',
      secret: true,
      required: true,
    },
    { key: 'username', label: 'Merchant email', secret: false, required: true },
    {
      key: 'password',
      label: 'Merchant password',
      secret: true,
      required: true,
    },
  ],
} as const satisfies Record<
  CourierProvider,
  ReadonlyArray<{
    key: string
    label: string
    secret: boolean
    required: boolean
  }>
>

export interface CourierConfigView {
  id: string
  provider: CourierProvider
  displayName: string
  isEnabled: boolean
  testMode: boolean
  isDefault: boolean
  /** Field key -> masked value. Absent keys are unset. */
  credentialPreview: Record<string, string>
  settings: Record<string, unknown>
  webhookToken: string
  hasWebhookSecret: boolean
  lastVerifiedAt: Date | null
  lastErrorMessage: string | null
}

function newWebhookToken(): string {
  // 32 hex characters. This is the only thing standing between a courier
  // callback URL and someone else's orders, so it is generated the same way a
  // session token would be, not from an id or a slug.
  return randomBytes(16).toString('hex')
}

/** Decrypts one config's credentials. Server-side only, never returned upward. */
function readCredentials(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== 'object') return {}

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(
    stored as Record<string, unknown>
  )) {
    if (typeof value !== 'string') continue
    try {
      result[key] = decryptSecret(value)
    } catch {
      // One unreadable field — a key rotated without re-encrypting, a truncated
      // column — must not take the whole config down. The connection test will
      // report the missing field in language the merchant can act on.
      continue
    }
  }
  return result
}

function previewOf(
  provider: CourierProvider,
  credentials: Record<string, string>
): Record<string, string> {
  const preview: Record<string, string> = {}
  for (const field of COURIER_FIELDS[provider]) {
    const value = credentials[field.key]
    if (!value) continue
    // Non-secret values are shown in full: an API key identifier or a login
    // email is what the merchant needs to confirm they configured the right
    // account, and masking it makes the page useless without making it safer.
    preview[field.key] = field.secret ? maskSecret(value) : value
  }
  return preview
}

export async function listCourierConfigs(
  organizationId: string
): Promise<CourierConfigView[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const configs = await prisma.courierConfig.findMany({
    where: { organizationId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })

  return configs.map((config) => ({
    id: config.id,
    provider: config.provider,
    displayName: config.displayName,
    isEnabled: config.isEnabled,
    testMode: config.testMode,
    isDefault: config.isDefault,
    credentialPreview: previewOf(
      config.provider,
      readCredentials(config.credentials)
    ),
    settings: (config.settings as Record<string, unknown>) ?? {},
    webhookToken: config.webhookToken,
    hasWebhookSecret: Boolean(config.webhookSecret),
    lastVerifiedAt: config.lastVerifiedAt,
    lastErrorMessage: config.lastErrorMessage,
  }))
}

export interface SaveCourierConfigInput {
  provider: CourierProvider
  displayName?: string
  isEnabled?: boolean
  testMode?: boolean
  isDefault?: boolean
  /** Only non-empty values are written; empty means "keep what is stored". */
  credentials?: Record<string, string>
  settings?: Record<string, unknown>
}

export async function saveCourierConfig(
  organizationId: string,
  input: SaveCourierConfigInput
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const existing = await prisma.courierConfig.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: input.provider },
    },
  })

  const current = readCredentials(existing?.credentials)

  // Merge, then drop blanks. A merchant clearing a field they never set should
  // not leave an empty string behind that later reads as "configured".
  const merged: Record<string, string> = { ...current }
  for (const [key, value] of Object.entries(input.credentials ?? {})) {
    const trimmed = value.trim()
    if (trimmed) merged[key] = trimmed
  }

  const encrypted = Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, encryptSecret(value)])
  )

  // Cast at the boundary: this is a structurally plain record, but Prisma's
  // InputJsonValue only accepts types carrying an index signature, which a
  // spread of two `Record<string, unknown>` does not satisfy on its own.
  const settings = {
    ...((existing?.settings as Record<string, unknown>) ?? {}),
    ...(input.settings ?? {}),
  } as Prisma.InputJsonValue

  const config = await prisma.courierConfig.upsert({
    where: {
      organizationId_provider: { organizationId, provider: input.provider },
    },
    create: {
      organizationId,
      provider: input.provider,
      displayName: input.displayName?.trim() || defaultName(input.provider),
      isEnabled: input.isEnabled ?? false,
      testMode: input.testMode ?? false,
      isDefault: input.isDefault ?? false,
      credentials: encrypted,
      settings,
      webhookToken: newWebhookToken(),
    },
    update: {
      displayName: input.displayName?.trim() || undefined,
      isEnabled: input.isEnabled,
      testMode: input.testMode,
      isDefault: input.isDefault,
      credentials: encrypted,
      settings,
      // Credentials changed, so whatever we knew about their validity is stale,
      // and a Pathao token minted from the old ones is worthless.
      lastVerifiedAt: input.credentials ? null : undefined,
      ...(input.credentials
        ? { accessToken: null, refreshToken: null, tokenExpiresAt: null }
        : {}),
    },
    select: { id: true, provider: true },
  })

  // Exactly one default. Done after the upsert so the row being promoted is
  // never caught by its own demotion.
  if (input.isDefault) {
    await prisma.courierConfig.updateMany({
      where: { organizationId, id: { not: config.id } },
      data: { isDefault: false },
    })
  }

  return config
}

function defaultName(provider: CourierProvider): string {
  return provider === 'STEADFAST' ? 'Steadfast Courier' : 'Pathao Courier'
}

export async function deleteCourierConfig(
  organizationId: string,
  provider: CourierProvider
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  await prisma.courierConfig.deleteMany({
    where: { organizationId, provider },
  })
}

/**
 * Issues a new inbound webhook token, invalidating the old URL immediately.
 *
 * A clean cut rather than an overlap: if a courier is still calling the old
 * URL, that should fail loudly at the next status update while the merchant is
 * looking at this screen — not silently keep working and break a week later.
 */
export async function rotateCourierWebhookToken(
  organizationId: string,
  provider: CourierProvider
): Promise<string> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const token = newWebhookToken()
  const updated = await prisma.courierConfig.updateMany({
    where: { organizationId, provider },
    data: { webhookToken: token },
  })
  if (updated.count === 0) throw new Error('That courier is not configured yet')

  return token
}

/**
 * Sets the shared secret the courier must present on inbound calls.
 *
 * Pathao asks the merchant to type a secret into their panel and sends it back
 * as `X-PATHAO-Signature`; Steadfast sends `Authorization: Bearer <value>`. One
 * field covers both because in both cases it is a fixed string we compare.
 */
export async function setCourierWebhookSecret(
  organizationId: string,
  provider: CourierProvider,
  secret: string | null
): Promise<void> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const updated = await prisma.courierConfig.updateMany({
    where: { organizationId, provider },
    data: {
      webhookSecret: secret?.trim() ? encryptSecret(secret.trim()) : null,
    },
  })
  if (updated.count === 0) throw new Error('That courier is not configured yet')
}

/** Generates a strong secret for the merchant to paste into the courier panel. */
export function suggestWebhookSecret(): string {
  return `cwh_${randomBytes(24).toString('base64url')}`
}

// ── Client construction ──────────────────────────────────────────────────

/**
 * Builds a client for one courier from that organisation's stored credentials.
 *
 * Deliberately *not* cached across calls. A cached client is a cached set of
 * decrypted tenant credentials sitting in module scope, and the one bug that
 * mixes two tenants' clients ships parcels to the wrong merchant's account.
 * Pathao's token — the only expensive part — is cached in the database instead,
 * which is per-tenant by construction.
 */
export async function courierClientFor(
  organizationId: string,
  provider: CourierProvider,
  { requireEnabled = true } = {}
): Promise<CourierClient> {
  const config = await prisma.courierConfig.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  })

  if (!config) {
    throw new CourierNotConfiguredError(
      `${defaultName(provider)} is not set up for this workspace`
    )
  }
  if (requireEnabled && !config.isEnabled) {
    throw new CourierNotConfiguredError(
      `${config.displayName} is switched off in courier settings`
    )
  }

  const credentials = readCredentials(config.credentials)

  if (provider === 'STEADFAST') {
    return new SteadfastClient({
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
    })
  }

  return new PathaoClient({
    credentials: {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
    },
    settings: (config.settings as Record<string, unknown>) ?? {},
    testMode: config.testMode,
    token: {
      accessToken: config.accessToken ? safeDecrypt(config.accessToken) : null,
      refreshToken: config.refreshToken
        ? safeDecrypt(config.refreshToken)
        : null,
      expiresAt: config.tokenExpiresAt,
    },
    onToken: async (token) => {
      await prisma.courierConfig.update({
        where: { id: config.id },
        data: {
          accessToken: token.accessToken
            ? encryptSecret(token.accessToken)
            : null,
          refreshToken: token.refreshToken
            ? encryptSecret(token.refreshToken)
            : null,
          tokenExpiresAt: token.expiresAt,
        },
      })
    },
  })
}

function safeDecrypt(value: string): string | null {
  try {
    return decryptSecret(value)
  } catch {
    // A token that cannot be decrypted is simply a cache miss — re-authenticate
    // rather than failing.
    return null
  }
}

// ── Connection testing ───────────────────────────────────────────────────

export interface CourierTestResult {
  ok: boolean
  detail: string
  /** Populated for Pathao, so the merchant can pick a pickup store inline. */
  stores?: PathaoStore[]
}

/**
 * Proves the stored credentials work, and records the outcome.
 *
 * Runs against the *stored* credentials rather than whatever is in the form, so
 * a green tick means "the thing that will dispatch tomorrow's orders works" and
 * not "the string you just typed parsed". The result is written to the config
 * so the settings page can show when it last worked without re-testing on every
 * page load.
 *
 * Only the parcel-creating API pair is tested here. The portal logins that read
 * delivery history are separate accounts with their own health, tested one by
 * one in fraudAccountService — folding them in would report a single verdict
 * for two unrelated things and hide which of them is actually broken.
 */
export async function testCourierConnection(
  organizationId: string,
  provider: CourierProvider
): Promise<CourierTestResult> {
  await requireOrgAccess(organizationId, 'ADMIN')

  try {
    // Disabled couriers are testable: a merchant configures and tests before
    // switching on, which is the correct order to do it in.
    const client = await courierClientFor(organizationId, provider, {
      requireEnabled: false,
    })

    const result = await client.verify()

    let stores: PathaoStore[] | undefined
    if (client instanceof PathaoClient) {
      stores = await client.listStores()
    }

    await prisma.courierConfig.updateMany({
      where: { organizationId, provider },
      data: { lastVerifiedAt: new Date(), lastErrorMessage: null },
    })

    return { ok: true, detail: result.detail, stores }
  } catch (cause) {
    const detail =
      cause instanceof Error ? cause.message : 'The connection test failed'

    await prisma.courierConfig.updateMany({
      where: { organizationId, provider },
      data: { lastErrorMessage: detail.slice(0, 500) },
    })

    return { ok: false, detail }
  }
}

/** The default courier for new dispatches, or null if none is usable. */
export async function defaultCourierProvider(
  organizationId: string
): Promise<CourierProvider | null> {
  const configs = await prisma.courierConfig.findMany({
    where: { organizationId, isEnabled: true },
    orderBy: [{ isDefault: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
    select: { provider: true },
  })

  return configs[0]?.provider ?? null
}
