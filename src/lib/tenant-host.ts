import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'

/**
 * Which tenant a request's `Host` header names, or null if it names none.
 *
 * This lives on its own because two places need the same answer and had each
 * grown their own copy: the proxy, deciding whether to rewrite to the public
 * renderer, and the storefront order API, deciding which store an order may be
 * placed for. They disagreed — the API compared a port-stripped hostname
 * against a ROOT_DOMAIN that still carried its port, so on any host with a
 * port (`localhost:3001`, every dev machine) it matched nothing and refused
 * every order with "Orders can only be placed from a storefront address".
 *
 * Ports are stripped from both sides: a tenant is identified by name, and
 * `acme.example.com:3001` is the same tenant as `acme.example.com`.
 *
 * Reserved subdomains are refused here rather than at the call sites, so the
 * proxy and the API cannot drift on which names are tenants — if the proxy
 * will not route `admin.example.com` to a storefront, the order API must not
 * accept orders claiming to come from one either.
 */
export function tenantSubdomain(
  host: string,
  rootDomain: string
): string | null {
  const hostname = host.split(':')[0]?.toLowerCase()
  const root = rootDomain.split(':')[0]?.toLowerCase()

  if (!hostname || !root) return null
  if (hostname === root) return null
  if (!hostname.endsWith(`.${root}`)) return null

  const label = hostname.slice(0, -(root.length + 1))
  if (!label || label.includes('.')) return null
  if (RESERVED_SUBDOMAINS.has(label)) return null

  return label
}
