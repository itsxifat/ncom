/**
 * Where to send someone once they have finished signing in.
 *
 * The proxy's auth gate parks the URL a signed-out visitor asked for in a
 * `callbackUrl` query parameter — NextAuth writes it as an absolute href, query
 * string and all, which is precisely what lets an invitation token survive the
 * detour through /login.
 *
 * Only the path and query survive sanitising. Dropping the origin is what makes
 * this safe rather than merely careful: the value reaches us from a query string
 * on a page anyone can link to, and is then handed straight to a redirect, so
 * `//evil.com` or `https://evil.com/login` would otherwise turn our own sign-in
 * screen into a convincing phishing hop. With the origin discarded the redirect
 * is same-origin by construction, whatever was passed in.
 */

export const DEFAULT_POST_AUTH_PATH = '/dashboard'

/** Bouncing back to an auth screen after authenticating is just a loop. */
const AUTH_PATHS = new Set(['/login', '/register', '/verify-email'])

export function safeCallbackPath(
  raw: unknown,
  fallback: string = DEFAULT_POST_AUTH_PATH
): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback

  let parsed: URL
  try {
    // The base is a throwaway: relative input resolves against it, absolute
    // input replaces it, and either way only pathname/search are read back.
    parsed = new URL(raw, 'http://callback.invalid')
  } catch {
    return fallback
  }

  const path = `${parsed.pathname}${parsed.search}`

  // A `javascript:` URL parses to a "pathname" that is not a path at all, and
  // is the one shape that could still escape being treated as a route.
  if (!path.startsWith('/')) return fallback
  if (AUTH_PATHS.has(parsed.pathname)) return fallback

  return path
}
