import type { PageTheme } from '@/modules/sections/types'

/**
 * The theme a new store starts with, and the fallback the public renderer uses
 * when a store somehow has none.
 *
 * Deliberately untyped as `PageTheme` and instead *checked* against it below.
 * PageTheme is the render-time shape and carries resolved values that are not
 * columns (`logoUrl`), so annotating this as PageTheme would make it invalid
 * as a Prisma `ThemeSettings` create input — which is its other job. The
 * `satisfies` check keeps both true: every key here is a real column, and the
 * object is still known to be a usable theme.
 */
export const DEFAULT_THEME = {
  primaryColor: '#1a1a1a',
  secondaryColor: '#008060',
  backgroundColor: '#ffffff',
  textColor: '#202223',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  buttonStyle: 'SOLID',
  borderRadius: 'md',
  spacingScale: 'comfortable',
  containerWidth: '1200px',
  headingWeight: '600',
  bodyScale: '1',
  sectionSpacing: 'comfortable',
  showStickyHeader: true,
} as const satisfies PageTheme
