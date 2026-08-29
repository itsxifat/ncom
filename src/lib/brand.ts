/**
 * The brand assets, in one place.
 *
 * Every logo in the app resolves through here so replacing a file is a one-line
 * change rather than a search for hard-coded paths. Intrinsic dimensions travel
 * with each asset because `next/image` needs them to reserve space and avoid
 * layout shift, and reading them from the file at render time is not possible for
 * something in `public/`.
 *
 * The wordmark ships as flat lime on transparency. In the app `BrandMark`
 * darkens it to ink on light surfaces with a CSS filter, so there is one file
 * to replace rather than two to keep in sync — see that component for why.
 * Email cannot filter and cannot resize sensibly, so it gets its own copy.
 */

export const BRAND_NAME = 'NCOM'

/** Tight-cropped horizontal wordmark. The default lockup everywhere in the UI. */
export const BRAND_WORDMARK = {
  src: '/Ncom-1-Logo.png',
  width: 1180,
  height: 261,
} as const

/**
 * The same wordmark centred on a square canvas.
 *
 * Kept for contexts that demand a 1:1 asset (a social card, a store listing).
 * Deliberately NOT used for the favicon: it is the full four-letter wordmark with
 * heavy transparent padding, so at 32px it renders as an illegible sliver. The
 * app icons are generated from the leading glyph instead — see
 * scripts/generate-app-icons.mjs.
 */
export const BRAND_SQUARE = {
  src: '/Ncom-2-Logo.png',
  width: 2000,
  height: 2000,
} as const

/**
 * The wordmark at email size.
 *
 * 360px wide — roughly 3x the ~112px a message actually displays it at, which
 * stays crisp on a retina phone without posting the 1180px original into every
 * email. It stays lime because the email masthead is ink; see
 * `server/email/layout.ts` for why mail does not follow the app's ink-on-light
 * rule. Regenerate from `Ncom-1-Logo.png` if the logo changes.
 */
export const BRAND_WORDMARK_EMAIL = {
  src: '/ncom-wordmark-lime.png',
  width: 360,
  height: 80,
} as const

/** Sampled from the wordmark itself. */
export const BRAND_LIME = '#dff83f'
export const BRAND_INK = '#0b0b0c'
