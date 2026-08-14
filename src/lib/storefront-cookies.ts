/**
 * Cookie names used by the public storefront.
 *
 * These are set on the tenant's own hostname, not on NCOM's. They are
 * deliberately `httpOnly` and `sameSite: 'lax'`: the cart token is a bearer
 * credential — whoever holds it can read and modify that cart — so tenant
 * JavaScript running on a tenant storefront must not
 * be able to read it, and it must not ride along on cross-site requests.
 */

export const CART_TOKEN_COOKIE = 'ncom_cart'
export const CUSTOMER_SESSION_COOKIE = 'ncom_customer'

export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
export const CUSTOMER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export const storefrontCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const
