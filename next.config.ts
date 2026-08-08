import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// No nonces: nonce-based CSP forces every page to render dynamically,
// which conflicts with the static/CDN-cacheable public pages planned for
// the publishing pipeline. 'unsafe-inline' on style-src is required
// because Base UI (the component primitives this app uses) positions
// popovers/menus via inline `style` attributes.
//
// script-src/connect-src explicitly allow only the analytics integrations
// tenants can configure (GA, GTM, Meta Pixel) — deliberately not widened
// to `https:` generally, since a tenant's "custom head script" field runs
// under this same policy and a narrow allowlist limits what it can load.
const ANALYTICS_SCRIPT_SRC =
  'https://www.googletagmanager.com https://connect.facebook.net'
const ANALYTICS_CONNECT_SRC =
  'https://www.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://www.facebook.com'

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' ${ANALYTICS_SCRIPT_SRC}${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self' data:;
  connect-src 'self' ${ANALYTICS_CONNECT_SRC}${isDev ? ' ws://localhost:* http://localhost:*' : ''};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  ${isDev ? '' : 'upgrade-insecure-requests;'}
`
  .replace(/\s{2,}/g, ' ')
  .trim()

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspHeader },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  ...(isDev
    ? []
    : [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]),
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
