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

  // Compared against the Host header rather than `request.url`. Behind a reverse
  // proxy Next builds `request.url` from the address the server bound to
  // (127.0.0.1:3013) rather than the hostname the browser used, so the two could
  // never agree and every legitimate request to these routes was rejected as
  // CSRF — registration and media upload returned 403 in production while
  // working in dev, where the two happen to coincide.
  //
  // Host is also the correct thing to compare: it is the name the browser
  // addressed, and Origin is what that same browser reports as the page's
  // origin. A forged Host does not help an attacker, because a cross-site
  // request still carries the attacker's own Origin and therefore still fails.
  const host = request.headers.get('host')
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
