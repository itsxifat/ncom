/**
 * How a request's hostname reaches the public site routes.
 *
 * `/sites/[subdomain]` was built for one addressing scheme: the tenant's NCOM
 * subdomain. Custom domains add a second, and the routes need to accept both
 * without the proxy resolving anything — `proxy.ts` runs on every request
 * including prefetches, and its existing contract is that it never touches the
 * database.
 *
 * So the proxy passes the hostname through in the same slot, tagged with a
 * prefix, and the resolution happens inside the route where a database read is
 * expected and cacheable. `~` is safe as the tag because it is not a legal
 * character in a DNS label, so no real subdomain can collide with it.
 */

export const DOMAIN_HANDLE_PREFIX = '~'

export function encodeDomainHandle(hostname: string): string {
  return `${DOMAIN_HANDLE_PREFIX}${hostname.toLowerCase()}`
}

export function isDomainHandle(handle: string): boolean {
  return handle.startsWith(DOMAIN_HANDLE_PREFIX)
}

export function decodeDomainHandle(handle: string): string {
  return handle.slice(DOMAIN_HANDLE_PREFIX.length).toLowerCase()
}

/**
 * Hostnames that belong to NCOM itself rather than to a tenant.
 *
 * Anything not on this list and not a tenant subdomain is treated as a custom
 * domain. That default is why the list has to include every name the platform
 * itself answers on — a preview deployment or a load-balancer health-check host
 * that is missing here would have its dashboard requests rewritten to a
 * storefront lookup and 404.
 */
export function platformHostnames(): Set<string> {
  const hosts = new Set<string>(['localhost', '127.0.0.1', '[::1]'])

  const add = (value: string | undefined) => {
    if (!value) return
    const hostname = value
      .replace(/^https?:\/\//, '')
      .split('/')[0]!
      .split(':')[0]!
      .toLowerCase()
    if (hostname) hosts.add(hostname)
  }

  add(process.env.ROOT_DOMAIN)
  add(process.env.AUTH_URL)
  for (const entry of (process.env.PLATFORM_HOSTS ?? '').split(',')) {
    add(entry.trim())
  }

  return hosts
}

/**
 * Whether a Host header names a candidate custom domain.
 *
 * Bare IPs and single-label hosts are excluded: a custom domain always has a
 * dot, and treating `10.0.0.5` as a tenant would break internal health checks.
 */
export function isCandidateCustomDomain(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase()
  if (!hostname) return false
  if (!hostname.includes('.')) return false
  if (/^[\d.]+$/.test(hostname)) return false
  if (platformHostnames().has(hostname)) return false
  return true
}
