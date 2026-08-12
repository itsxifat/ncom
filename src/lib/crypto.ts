import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

/**
 * Envelope encryption for secrets at rest — currently payment provider API
 * keys (PaymentProviderConfig.credentials).
 *
 * Why this exists: a merchant's Stripe secret key in a plaintext JSON column
 * means any SQL injection, any leaked backup, any over-broad read replica
 * grant, and any support engineer with database access is a full compromise of
 * that merchant's payment account. Encrypting at the application layer means
 * the database alone is not enough.
 *
 * AES-256-GCM is authenticated: tampering with a stored ciphertext produces a
 * decryption failure rather than silently different plaintext. That matters
 * here — an attacker who can write to the database but not read the key must
 * not be able to flip a byte and redirect payouts.
 *
 * The key is derived from AUTH_SECRET via HKDF with a distinct `info` label,
 * so the encryption key is cryptographically separate from the session-signing
 * key even though both come from one env var. Reusing AUTH_SECRET directly for
 * two purposes is how one compromise becomes two.
 *
 * ROTATION: the format carries a version byte. To rotate, add a new key
 * derivation, decrypt with the old, re-encrypt with the new. Nothing here
 * assumes a single key forever.
 */

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

const HKDF_INFO = 'ncom:credential-encryption:v1'
/**
 * A fixed salt is acceptable here: HKDF's salt adds domain separation, not
 * secrecy, and AUTH_SECRET is already high-entropy. A random per-record salt
 * would have to be stored beside the ciphertext for no security gain.
 */
const HKDF_SALT = 'ncom-credential-salt'

let cachedKey: Buffer | null = null

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey

  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set — required to encrypt credentials')
  }

  cachedKey = Buffer.from(
    hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, KEY_LENGTH)
  )
  return cachedKey
}

/**
 * Encrypts a string, returning `v1.<iv>.<authTag>.<ciphertext>` in base64url.
 *
 * A fresh random IV per call is mandatory for GCM: reusing an IV with the same
 * key breaks the cipher's confidentiality *and* leaks the authentication key.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted payload')
  }

  const [version, ivPart, tagPart, dataPart] = parts
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`)
  }

  const iv = Buffer.from(ivPart, 'base64url')
  const authTag = Buffer.from(tagPart, 'base64url')
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Malformed encrypted payload')
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv)
  decipher.setAuthTag(authTag)

  // Throws if the ciphertext or tag was tampered with.
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** Encrypts each value of a credentials map, leaving the keys readable. */
export function encryptCredentials(
  credentials: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [
      key,
      encryptSecret(value),
    ])
  )
}

export function decryptCredentials(
  stored: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(stored).map(([key, value]) => [key, decryptSecret(value)])
  )
}

/**
 * Last-4 preview for showing a saved key in the admin without revealing it.
 * Everything before the tail is replaced, so key length is not disclosed
 * either.
 */
export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4)
  return `••••••••${tail}`
}
