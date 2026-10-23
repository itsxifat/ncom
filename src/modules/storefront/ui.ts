/**
 * The look of an online store's own controls — buttons, fields, panels.
 *
 * Painted entirely from the page theme's variables (see
 * modules/sections/theme.tsx), so the cart drawer, the checkout and the
 * account pages wear the merchant's colours, type and corner radius without
 * either of them being designed twice. These are the parts of a store the
 * builder does not lay out — a checkout is not a place for drag and drop — and
 * the theme is how they still match everything that is.
 */

const RADIUS = 'rounded-[min(var(--page-radius),1.25rem)]'

/** The main action: "Add to cart", "Place order". */
export const primaryButton = `inline-flex min-h-11 items-center justify-center gap-2 ${RADIUS} bg-[var(--page-primary)] px-6 text-sm font-semibold text-[var(--page-on-primary)] transition hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50`

/** A second action beside the first: "View cart", "Continue shopping". */
export const secondaryButton = `inline-flex min-h-11 items-center justify-center gap-2 ${RADIUS} border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] bg-transparent px-6 text-sm font-semibold text-[var(--page-text)] transition hover:border-[color-mix(in_oklab,var(--page-text)_40%,transparent)] disabled:pointer-events-none disabled:opacity-50`

export const textField = `h-11 w-full ${RADIUS} border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] bg-[var(--page-background)] px-3.5 text-[15px] text-[var(--page-text)] outline-none transition placeholder:text-[color-mix(in_oklab,var(--page-text)_45%,transparent)] focus:border-[var(--page-primary)] focus:ring-3 focus:ring-[color-mix(in_oklab,var(--page-primary)_18%,transparent)]`

export const fieldLabel = 'text-sm font-medium text-[var(--page-text)]'

/** A quiet surface: summaries, empty states, the order total box. */
export const panel = `${RADIUS} bg-[color-mix(in_oklab,var(--page-text)_4%,var(--page-background))]`

export const muted =
  'text-[color-mix(in_oklab,var(--page-text)_62%,transparent)]'

export const hairline =
  'border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]'

export const headingFont = '[font-family:var(--page-font-heading)]'
