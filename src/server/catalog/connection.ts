import 'server-only'
import { cache } from 'react'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto'
import { assertPublicHttpsUrl } from '@/lib/outbound-url'
import { catalogFetch } from './client'
import { CONTRACT_VERSION, parseIdentity } from './contract'
import {
  CatalogNotConfiguredError,
  CatalogError,
  isCatalogError,
} from './errors'
import {
  NO_CAPABILITIES,
  type CatalogCapabilities,
  type CatalogIdentity,
} from './types'

/**
 * Where a workspace's products come from.
 *
 * This is the only catalogue-shaped thing NCOM stores, and it is configuration:
 * a URL, a key id, an HMAC secret, and whatever the site said about itself the
 * last time we shook hands. It changes when a merchant redeploys their website,
 * not when they sell a shirt.
 *
 * The secret is generated here rather than typed by the merchant, for the same
 * reason API keys are: a secret someone chooses is a secret someone reuses. It
 * is shown once, at creation and after a rotation, and is stored encrypted —
 * possession of it allows reading a merchant's entire catalogue and moving
 * their stock, so a leaked database must not be enough to do either.
 */

export interface CatalogConnection {
  id: string
  organizationId: string
  baseUrl: string
  keyId: string
  /** Decrypted. Never leaves the server, never reaches a client component. */
  secret: string
  timeoutMs: number
  isActive: boolean
  capabilities: CatalogCapabilities
  currencyCode: string | null
}

/**
 * The connection for a workspace, or null if it has none.
 *
 * Wrapped in React's `cache` so one page render reads the row once however many
 * sections ask for products. This is request-scoped memoisation of the
 * *connection*, not of the catalogue — nothing about a product is held here,
 * and the memo dies with the request.
 */
export const loadConnection = cache(
  async (organizationId: string): Promise<CatalogConnection | null> => {
    const row = await prisma.catalogConnection.findUnique({
      where: { organizationId },
    })
    if (!row) return null

    return {
      id: row.id,
      organizationId: row.organizationId,
      baseUrl: row.baseUrl,
      keyId: row.keyId,
      secret: decryptSecret(row.secret),
      timeoutMs: row.timeoutMs,
      isActive: row.isActive,
      capabilities: readCapabilities(row.capabilities),
      currencyCode: row.currencyCode,
    }
  }
)

export async function requireConnection(
  organizationId: string
): Promise<CatalogConnection> {
  const connection = await loadConnection(organizationId)
  if (!connection) throw new CatalogNotConfiguredError()
  if (!connection.isActive) {
    throw new CatalogError(
      'not_configured',
      'The product source for this workspace is switched off.'
    )
  }
  return connection
}

function readCapabilities(value: unknown): CatalogCapabilities {
  if (!value || typeof value !== 'object') return { ...NO_CAPABILITIES }
  const raw = value as Record<string, unknown>
  const read = (key: keyof CatalogCapabilities) => raw[key] === true

  return {
    products: read('products'),
    stock: read('stock'),
    search: read('search'),
    categories: read('categories'),
    reserve: read('reserve'),
    release: read('release'),
  }
}

// ── Dashboard surface ────────────────────────────────────────────────────

export interface ConnectionStatus {
  baseUrl: string
  keyId: string
  secretHint: string
  timeoutMs: number
  isActive: boolean
  capabilities: CatalogCapabilities
  contractVersion: string | null
  platform: string | null
  currencyCode: string | null
  lastCheckedAt: Date | null
  lastOkAt: Date | null
  lastError: string | null
}

export async function getConnectionStatus(
  organizationId: string
): Promise<ConnectionStatus | null> {
  await requireOrgAccess(organizationId)

  const row = await prisma.catalogConnection.findUnique({
    where: { organizationId },
  })
  if (!row) return null

  return {
    baseUrl: row.baseUrl,
    keyId: row.keyId,
    // Enough to tell two secrets apart in a support conversation, never enough
    // to sign with.
    secretHint: maskSecret(decryptSecret(row.secret)),
    timeoutMs: row.timeoutMs,
    isActive: row.isActive,
    capabilities: readCapabilities(row.capabilities),
    contractVersion: row.contractVersion,
    platform: row.platform,
    currencyCode: row.currencyCode,
    lastCheckedAt: row.lastCheckedAt,
    lastOkAt: row.lastOkAt,
    lastError: row.lastError,
  }
}

export interface SaveConnectionInput {
  baseUrl: string
  timeoutMs?: number
  isActive?: boolean
}

export interface SavedConnection {
  keyId: string
  /** Present only when a secret was just minted. Shown once and never again. */
  secret: string | null
}

/**
 * Points a workspace at a website.
 *
 * Saving does not verify the connection — `checkConnection` does, and the
 * settings screen runs it immediately afterwards. Keeping them apart is what
 * lets a merchant save the URL, go and deploy their connector, and press Test
 * rather than losing what they typed because the endpoint is not live yet.
 */
export async function saveConnection(
  organizationId: string,
  input: SaveConnectionInput
): Promise<SavedConnection> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const timeoutMs = clampTimeout(input.timeoutMs)

  const existing = await prisma.catalogConnection.findUnique({
    where: { organizationId },
    select: { id: true, keyId: true },
  })

  if (existing) {
    await prisma.catalogConnection.update({
      where: { organizationId },
      data: {
        baseUrl,
        timeoutMs,
        isActive: input.isActive ?? true,
        // A moved connector has to prove itself again before the panel claims
        // it is healthy.
        lastOkAt: null,
        lastError: null,
        lastCheckedAt: null,
      },
    })
    return { keyId: existing.keyId, secret: null }
  }

  const keyId = `ncomcat_${randomBytes(6).toString('hex')}`
  const secret = `ncomsec_${randomBytes(24).toString('base64url')}`

  await prisma.catalogConnection.create({
    data: {
      organizationId,
      baseUrl,
      keyId,
      secret: encryptSecret(secret),
      timeoutMs,
      isActive: input.isActive ?? true,
    },
  })

  return { keyId, secret }
}

export async function rotateConnectionSecret(
  organizationId: string
): Promise<SavedConnection> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const secret = `ncomsec_${randomBytes(24).toString('base64url')}`
  const keyId = `ncomcat_${randomBytes(6).toString('hex')}`

  // The key id rotates with the secret so a site can hold both briefly and tell
  // them apart — verify by key id, and the old one keeps working until the
  // merchant deletes it.
  const row = await prisma.catalogConnection.update({
    where: { organizationId },
    data: { secret: encryptSecret(secret), keyId },
    select: { keyId: true },
  })

  return { keyId: row.keyId, secret }
}

export async function deleteConnection(organizationId: string): Promise<void> {
  await requireOrgAccess(organizationId, 'ADMIN')
  await prisma.catalogConnection.deleteMany({ where: { organizationId } })
}

/**
 * Asks a connector what it is and what it can do, and records the answer.
 *
 * Run when a merchant presses Test, and by the health cron. Never on the
 * storefront path — a shopper's page render must not spend a round trip
 * confirming something the dashboard already knows.
 *
 * Lives here rather than beside the fetch it makes because it writes: keeping
 * it out of client.ts is what lets that module stay free of the database on the
 * hot path a shopper waits on.
 */
export async function checkConnection(
  organizationId: string
): Promise<
  { ok: true; identity: CatalogIdentity } | { ok: false; message: string }
> {
  try {
    const connection = await requireConnection(organizationId)
    const payload = await catalogFetch(connection, {
      method: 'GET',
      path: '/ping',
    })
    const identity = parseIdentity(payload)

    if (identity.contract !== CONTRACT_VERSION) {
      const message = `The connector speaks contract ${identity.contract}; this platform speaks ${CONTRACT_VERSION}.`
      await recordCheck(organizationId, { ok: false, message })
      return { ok: false, message }
    }

    await recordCheck(organizationId, { ok: true, identity })
    return { ok: true, identity }
  } catch (error) {
    const message = describeFailure(error)
    // A workspace with no connection at all has no row to write the failure to.
    await recordCheck(organizationId, { ok: false, message }).catch(() => {})
    return { ok: false, message }
  }
}

/** Records what a health check found. */
async function recordCheck(
  organizationId: string,
  result:
    { ok: true; identity: CatalogIdentity } | { ok: false; message: string }
): Promise<void> {
  const now = new Date()

  if (result.ok) {
    await prisma.catalogConnection.update({
      where: { organizationId },
      data: {
        lastCheckedAt: now,
        lastOkAt: now,
        lastError: null,
        capabilities: { ...result.identity.capabilities },
        contractVersion: result.identity.contract,
        platform: result.identity.platform,
        currencyCode: result.identity.currency,
      },
    })
    return
  }

  await prisma.catalogConnection.update({
    where: { organizationId },
    data: { lastCheckedAt: now, lastError: result.message.slice(0, 500) },
  })
}

/** The sentence a health check should show, whatever went wrong. */
export function describeFailure(error: unknown): string {
  if (isCatalogError(error)) return error.merchantMessage
  return error instanceof Error ? error.message : 'The check failed.'
}

function clampTimeout(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 4000
  // A shopper is waiting on the other end of this. Ten seconds is already an
  // abandoned page; anything longer is a decision to lose the sale slowly.
  return Math.min(10_000, Math.max(1000, Math.round(value)))
}

/**
 * Trailing slashes are stripped so every path in the client can start with one
 * and no URL is ever built with a double slash — some hosts 404 on those, and
 * that is a miserable half hour for whoever has to debug it.
 */
export function normalizeBaseUrl(raw: string): string {
  const url = assertPublicHttpsUrl(raw, 'The product source URL')
  return url.replace(/\/+$/, '')
}
