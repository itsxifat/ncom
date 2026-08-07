/** bcrypt work factor for password hashing. */
export const BCRYPT_COST = 12

/**
 * A precomputed bcrypt hash of a random value with no known plaintext.
 * `authorize()` compares against this when a user isn't found, so the
 * response takes the same time whether or not the email is registered —
 * otherwise the missing-user path (no hash to compare) returns measurably
 * faster than the wrong-password path, letting an attacker enumerate
 * registered emails purely from response timing.
 */
export const DUMMY_BCRYPT_HASH =
  '$2b$12$BNzQvy9N1/1ff2JBMEk7g.oZkyI8GSQ.N1y6GNx1qlMAhFt.RKMZ2'

/**
 * Route Handlers (unlike Server Actions) don't get Next.js's automatic
 * same-origin check, so state-changing ones must verify it themselves —
 * otherwise any site can POST to them from a background <form>/fetch using
 * the visitor's cookies (CSRF).
 */
export function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}
