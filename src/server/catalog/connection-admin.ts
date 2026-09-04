import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto'
import { normalizeBaseUrl, readCapabilities } from './connection'
import type { CatalogCapabilities } from './types'

/**
 * Changing where a workspace's products come from.
 *
 * The dashboard half of connection.ts: reading the status, saving a URL,
 * rotating the secret, disconnecting. Every one of these authorises first, and
 * that is why they are not in the module the storefront imports — a shopper
 * rendering a product page would otherwise load the entire session stack to
 * find out which website to ask.
 */

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

function clampTimeout(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 4000
  // A shopper is waiting on the other end of this. Ten seconds is already an
  // abandoned page; anything longer is a decision to lose the sale slowly.
  return Math.min(10_000, Math.max(1000, Math.round(value)))
}
