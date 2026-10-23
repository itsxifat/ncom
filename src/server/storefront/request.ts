import 'server-only'
import { cookies, headers } from 'next/headers'
import { env } from '@/lib/env'
import { tenantSubdomain } from '@/lib/tenant-host'
import { encodeDomainHandle, isCandidateCustomDomain } from '@/lib/site-handle'
import {
  CART_COOKIE_MAX_AGE,
  CART_TOKEN_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  storefrontCookieOptions,
} from '@/lib/storefront-cookies'
import {
  resolvePublicStore,
  type CachedStore,
} from '@/server/services/publishService'
import { getCustomerBySession } from '@/server/services/customerService'

/**
 * Which online store a storefront request is for.
 *
 * Read from the `Host` header and nothing else. A store's cart and checkout
 * run as server actions posted from the store's own pages, so the hostname the
 * browser sent them to *is* the store — a subdomain of ours, or a custom domain
 * the merchant has verified. Anything the page posts about which store it is
 * would be a claim the visitor could edit.
 *
 * Null for a landing site, an unknown host, or NCOM's own address — the
 * builder's canvas renders store blocks on the dashboard's host, and a click on
 * "Add to cart" there must not create a cart in anybody's store.
 */
export async function requestStore(): Promise<CachedStore | null> {
  const host = (await headers()).get('host') ?? ''
  const subdomain = tenantSubdomain(host, env.ROOT_DOMAIN)
  const handle =
    subdomain ??
    (isCandidateCustomDomain(host)
      ? encodeDomainHandle(host.split(':')[0]!)
      : null)
  if (!handle) return null

  const store = await resolvePublicStore(handle)
  return store && store.kind === 'STORE' ? store : null
}

export async function readCartToken(): Promise<string | null> {
  return (await cookies()).get(CART_TOKEN_COOKIE)?.value ?? null
}

export async function writeCartToken(token: string): Promise<void> {
  ;(await cookies()).set(CART_TOKEN_COOKIE, token, {
    ...storefrontCookieOptions,
    maxAge: CART_COOKIE_MAX_AGE,
  })
}

export async function clearCartToken(): Promise<void> {
  ;(await cookies()).delete(CART_TOKEN_COOKIE)
}

/** The shopper signed in on this device at this store, if any. */
export async function requestCustomer(organizationId: string) {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value ?? null
  return getCustomerBySession(organizationId, token)
}
