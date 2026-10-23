/**
 * Where to send a shopper after they sign in — only ever somewhere on this
 * same store.
 *
 * `next` arrives in the address bar, so anyone can write it, and a sign-in
 * page that forwards to whatever it is handed is a phishing tool: a link to
 * the real shop that lands the shopper, freshly signed in and trusting it, on
 * a look-alike. "Starts with one slash" is not enough on its own, because
 * browsers read `/\evil.com` as `//evil.com` and quietly drop tabs and line
 * breaks, so `/<tab>/evil.com` is too. The value is therefore resolved the way
 * a browser would resolve it, against a placeholder origin, and kept only if it
 * stays there — and what is returned is the path rebuilt from that parse, not
 * the raw text, so nothing is left for the browser to read differently.
 *
 * Kept out of the `'use server'` actions file, which may export only async
 * functions, so the sign-in and register pages can use the same rule.
 */
const PLACEHOLDER_ORIGIN = 'https://store.invalid'

/** One slash, then anything but a second slash or a backslash. */
const SAME_SITE_PATH = /^\/(?![/\\])/

export function safeNextPath(value: unknown, fallback = '/account'): string {
  if (typeof value !== 'string') return fallback
  // Control characters (tab, CR, LF and the rest) have no place in a path and
  // are exactly what a browser strips before it decides what a link means.
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback
  // A same-site path, never `//host`, `/\host` or a `scheme:` address.
  if (!SAME_SITE_PATH.test(value)) return fallback
  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN)
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback
    const path = `${url.pathname}${url.search}${url.hash}`
    // Checked again after parsing: resolving `/a/../..//evil.com` leaves a
    // path that starts `//`, which the browser would read as another site.
    return SAME_SITE_PATH.test(path) ? path : fallback
  } catch {
    return fallback
  }
}
