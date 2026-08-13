import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import type { ApiScope } from '@/generated/prisma/client'

/**
 * API keys for the public REST API.
 *
 * A merchant's other systems — the site they already sell from, a POS, a
 * warehouse script — authenticate with one of these. It is a machine
 * credential, not a session: it carries no user, it does not expire on sign-out
 * and it is scoped to exactly one organisation's data.
 *
 * The token is shown once and stored only as a SHA-256 hash. That is the whole
 * security model, and it means:
 *
 *   A leaked database, backup or read replica yields hashes, not usable keys.
 *   Nobody — not support, not an admin, not the merchant — can read a key back
 *   later, so "I lost it" is answered by rotating rather than by looking it up.
 *   Authentication is one indexed lookup on the hash, which is why it can sit
 *   on every request without adding a query to each one.
 *
 * SHA-256 rather than bcrypt or argon2 is deliberate. Those exist to slow down
 * guessing of low-entropy human passwords; this token is 32 random bytes, and a
 * deliberately slow hash would only add latency to every authenticated request
 * while doing nothing an attacker would notice.
 */

/** Distinguishes our keys in a merchant's config from every other vendor's. */
const KEY_PREFIX = 'ncom'

export interface ApiKeyIdentity {
  id: string
  organizationId: string
  name: string
  scopes: ApiScope[]
}

/**
 * All scopes, with what each one actually unlocks. Rendered in the create form
 * and in the docs, from here, so the three cannot disagree.
 */
export const API_SCOPES: {
  scope: ApiScope
  label: string
  description: string
}[] = [
  {
    scope: 'PRODUCTS_READ',
    label: 'Read products',
    description: 'List and fetch products, variants, options and images.',
  },
  {
    scope: 'PRODUCTS_WRITE',
    label: 'Write products',
    description:
      'Create, update, import and delete products. Needed for a catalogue import.',
  },
  {
    scope: 'CATEGORIES_READ',
    label: 'Read categories',
    description: 'List the category tree.',
  },
  {
    scope: 'CATEGORIES_WRITE',
    label: 'Write categories',
    description: 'Create, update and delete categories.',
  },
  {
    scope: 'INVENTORY_READ',
    label: 'Read inventory',
    description: 'Fetch stock levels per variant and per location.',
  },
  {
    scope: 'INVENTORY_WRITE',
    label: 'Write inventory',
    description:
      'Set or adjust stock. This is what a two-way stock sync needs.',
  },
  {
    scope: 'ORDERS_READ',
    label: 'Read orders',
    description: 'List and fetch orders and their lines.',
  },
  // ORDERS_WRITE exists in the enum but is deliberately not offered: order
  // mutations are recorded against the person who made them and appear in the
  // order's timeline, and an API key is not a person. Offering a permission
  // that unlocks no endpoint would be worse than not having it.
  {
    scope: 'WEBHOOKS_READ',
    label: 'Read webhooks',
    description: 'List webhook endpoints and their delivery history.',
  },
  {
    scope: 'WEBHOOKS_WRITE',
    label: 'Write webhooks',
    description: 'Create, update and delete webhook endpoints.',
  },
]

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Mints a key and returns the plaintext exactly once.
 *
 * The token is `ncom_<env>_<prefix>_<secret>`. The prefix half is stored in the
 * clear and shown in the UI so a merchant can tell two keys apart, revoke the
 * right one, and recognise it in their own logs; the secret half is what is
 * hashed. Splitting them is what makes a key identifiable without being
 * recoverable.
 */
export async function createApiKey(
  organizationId: string,
  input: { name: string; scopes: ApiScope[]; expiresAt?: Date | null },
  actorUserId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  if (input.scopes.length === 0) {
    throw new Error('Choose at least one permission for this key')
  }

  const environment = process.env.NODE_ENV === 'production' ? 'live' : 'test'
  const prefix = `${KEY_PREFIX}_${environment}_${randomBytes(4).toString('hex')}`
  const secret = randomBytes(32).toString('base64url')
  const token = `${prefix}.${secret}`

  const key = await prisma.apiKey.create({
    data: {
      organizationId,
      name: input.name.trim() || 'Untitled key',
      prefix,
      tokenHash: hashToken(token),
      last4: secret.slice(-4),
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: actorUserId,
    },
    select: { id: true, name: true, prefix: true, scopes: true },
  })

  return { key, token }
}

export async function listApiKeys(organizationId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const keys = await prisma.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      last4: true,
      scopes: true,
      lastUsedAt: true,
      lastUsedIp: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  })

  // Resolved here rather than in the component: reading the clock while
  // rendering makes a component's output depend on when it ran, and expiry does
  // not need to be live to the second.
  const now = Date.now()
  return keys.map((key) => ({
    ...key,
    isExpired: key.expiresAt !== null && key.expiresAt.getTime() <= now,
  }))
}

/**
 * Revokes rather than deletes.
 *
 * The row is what explains a 401 in someone's integration a week later, and
 * what shows that a compromised key was turned off and when. Deleting it
 * removes the evidence along with the access.
 */
export async function revokeApiKey(organizationId: string, keyId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
    select: { id: true, revokedAt: true },
  })
  if (!key) throw new Error('Key not found')
  if (key.revokedAt) return

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  })
}

/** Permanently removes a revoked key, once it is no longer worth explaining. */
export async function deleteApiKey(organizationId: string, keyId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
    select: { id: true, revokedAt: true },
  })
  if (!key) throw new Error('Key not found')
  if (!key.revokedAt) {
    throw new Error('Revoke the key before deleting it')
  }

  await prisma.apiKey.delete({ where: { id: keyId } })
}

/**
 * Resolves a bearer token to the organisation it can act on.
 *
 * Returns null for every failure — unknown, revoked, expired — rather than
 * saying which. A caller holding a wrong token learns only that it is wrong;
 * distinguishing "no such key" from "revoked key" tells an attacker which of
 * their guesses were once real.
 *
 * `lastUsedAt` is written on a successful lookup but deliberately not awaited:
 * it is bookkeeping for the merchant's benefit, and making every API request
 * wait on an extra write to record that it happened is a poor trade.
 */
export async function authenticateApiKey(
  token: string,
  ip?: string
): Promise<ApiKeyIdentity | null> {
  const trimmed = token.trim()
  if (trimmed === '') return null

  const key = await prisma.apiKey.findUnique({
    where: { tokenHash: hashToken(trimmed) },
    select: {
      id: true,
      organizationId: true,
      name: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
    },
  })

  if (!key) return null
  if (key.revokedAt) return null
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null

  void prisma.apiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date(), lastUsedIp: ip ?? null },
    })
    .catch(() => {
      // A failed usage stamp must never fail the request it was recording.
    })

  return {
    id: key.id,
    organizationId: key.organizationId,
    name: key.name,
    scopes: key.scopes,
  }
}

export function hasScope(identity: ApiKeyIdentity, scope: ApiScope): boolean {
  return identity.scopes.includes(scope)
}
