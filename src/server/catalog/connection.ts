import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db/client'
import { decryptSecret } from '@/lib/crypto'
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
 * Where a workspace's products come from — reading it.
 *
 * Split from the admin half (connection-admin.ts) on purpose. Every storefront
 * render reads this row, and the functions that *change* it need an authorised
 * session, which pulls the whole Auth.js stack into whatever imports them. A
 * shopper's page render has no session and no business loading one. Nothing
 * here authorises, because there is nothing here a tenant lookup has not
 * already decided; everything that does lives next door.
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

export function readCapabilities(value: unknown): CatalogCapabilities {
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

/**
 * Trailing slashes are stripped so every path in the client can start with one
 * and no URL is ever built with a double slash — some hosts 404 on those, and
 * that is a miserable half hour for whoever has to debug it.
 */
export function normalizeBaseUrl(raw: string): string {
  const url = assertPublicHttpsUrl(raw, 'The product source URL')
  return url.replace(/\/+$/, '')
}
