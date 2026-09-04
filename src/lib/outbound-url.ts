import 'server-only'

/**
 * The guard on every URL a merchant types that this server will then dial.
 *
 * Two of those now exist — webhook endpoints and the product connector — and
 * both are the same hazard: the merchant types it, our network makes the
 * request. Blocking loopback, link-local and private ranges keeps someone from
 * pointing an address at internal infrastructure and using our egress to reach
 * it.
 *
 * This is a literal-address check, not a DNS resolution — a hostname that
 * resolves to a private address still passes here. The real backstop for that
 * is egress policy at the network layer; this stops the easy cases and the
 * accidents, and http is refused outright in production so a signed request is
 * never sent in the clear.
 */
export function assertPublicHttpsUrl(raw: string, label: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('Enter a valid URL, including https://')
  }

  const isProduction = process.env.NODE_ENV === 'production'

  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && !isProduction)
  ) {
    throw new Error(`${label} must use https://`)
  }

  const host = url.hostname.toLowerCase()

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '[::1]' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    if (isProduction) {
      throw new Error('That address is not reachable from the internet')
    }
  }

  return url.toString()
}
