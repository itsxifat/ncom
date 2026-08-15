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

// Stripe Elements loads js.stripe.com and renders card fields inside an iframe
// hosted there — that iframe boundary is what keeps raw card numbers out of
// this origin entirely, so it is a security feature rather than an
// inconvenience to work around. Allowlisted narrowly (three exact hosts) for
// the same reason the analytics entries are: a tenant's custom head script
// runs under this same policy.
const STRIPE_SCRIPT_SRC = 'https://js.stripe.com'
const STRIPE_CONNECT_SRC = 'https://api.stripe.com https://maps.googleapis.com'
const STRIPE_FRAME_SRC = 'https://js.stripe.com https://hooks.stripe.com'

// The `video` block (modules/sections/video) embeds a YouTube player. Only the
// -nocookie host is allowed, which is the exact host that block builds its src
// from — the privacy-preserving domain that skips tracking cookies until the
// viewer actually hits play. Framing is all that is granted: the player's own
// scripts and XHRs live inside that cross-origin document, under YouTube's
// policy rather than this one, so no script-src/connect-src entry is needed.
const YOUTUBE_FRAME_SRC = 'https://www.youtube-nocookie.com'

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' ${ANALYTICS_SCRIPT_SRC} ${STRIPE_SCRIPT_SRC}${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self' data:;
  connect-src 'self' ${ANALYTICS_CONNECT_SRC} ${STRIPE_CONNECT_SRC}${isDev ? ' ws://localhost:* http://localhost:*' : ''};
  frame-src 'self' ${STRIPE_FRAME_SRC} ${YOUTUBE_FRAME_SRC};
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
  experimental: {
    // Media uploads are proxied through /api/media/*, and `src/proxy.ts`
    // makes Next buffer every request body — silently truncating anything
    // past this limit rather than erroring. At the 10MB default an upload
    // at the 10MB media cap (`MAX_MEDIA_UPLOAD_BYTES`) plus its multipart
    // framing gets cut off, so `formData()` fails to parse and the user
    // sees a generic parse error instead of "File is too large". Keeping
    // the buffer above the cap lets the app's own size check answer first.
    proxyClientMaxBodySize: '12mb',
  },
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
