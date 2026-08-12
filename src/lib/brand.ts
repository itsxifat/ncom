/**
 * The brand assets, in one place.
 *
 * Every logo in the app resolves through here so replacing a file is a one-line
 * change rather than a search for hard-coded paths. Intrinsic dimensions travel
 * with each asset because `next/image` needs them to reserve space and avoid
 * layout shift, and reading them from the file at render time is not possible for
 * something in `public/`.
 *
 * Both marks are the lime wordmark on transparency, and lime is the brand — so
 * the mark ships in that colour on every surface, light or dark, and is never
 * recoloured to suit a background. `BrandMark` renders it as supplied.
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

/** Sampled from the wordmark itself, matching `--lime` in globals.css. */
export const BRAND_LIME = '#dff83f'
export const BRAND_INK = '#0b0b0c'
