import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import { fontStack } from '@/lib/fonts'
import type { PageTheme } from './types'

const RADIUS_VALUES: Record<string, string> = {
  none: '0px',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
}

const SPACE_UNIT_VALUES: Record<string, string> = {
  compact: '0.75',
  comfortable: '1',
  spacious: '1.5',
}

/**
 * Maps a store's ThemeSettings row to CSS custom properties, namespaced
 * `--page-*` so a rendered page's theme never collides with (or gets
 * overridden by) NCOM's own dashboard theme tokens on the same DOM tree —
 * this wrapper renders inside the builder canvas and dashboard preview
 * chrome, both of which have their own --primary/--font-sans etc.
 */
export function themeToCssProperties(theme: PageTheme): CSSProperties {
  return {
    '--page-primary': theme.primaryColor,
    '--page-secondary': theme.secondaryColor,
    '--page-background': theme.backgroundColor,
    '--page-text': theme.textColor,
    // Resolved through the catalogue rather than quoted straight in: that is
    // what points these at the self-hosted face the merchant picked instead of
    // at a family name the visitor's device probably does not have installed.
    '--page-font-heading': fontStack(theme.headingFont),
    '--page-font-body': fontStack(theme.bodyFont),
    '--page-radius': RADIUS_VALUES[theme.borderRadius] ?? theme.borderRadius,
    '--page-space-unit': SPACE_UNIT_VALUES[theme.spacingScale] ?? '1',
    '--page-container-width': theme.containerWidth,
    '--page-heading-weight': theme.headingWeight ?? '600',
    '--page-body-scale': theme.bodyScale ?? '1',
    '--page-section-spacing':
      SPACE_UNIT_VALUES[theme.sectionSpacing ?? 'comfortable'] ?? '1',
    '--page-logo-width': `${theme.logoWidth ?? 140}px`,
  } as CSSProperties
}

export function PageThemeProvider({
  theme,
  children,
  className,
}: {
  theme: PageTheme
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      style={{
        ...themeToCssProperties(theme),
        backgroundColor: 'var(--page-background)',
        color: 'var(--page-text)',
        fontFamily: 'var(--page-font-body)',
      }}
      // `flex-1` so a merchant's background always reaches the bottom of the
      // viewport. NCOM's own <html> carries `dark`, which makes `body` ink — and
      // on a storefront shorter than the window, that ink would otherwise show
      // below the content as a black band under a light-themed store. Inert
      // wherever this renders outside a flex column (the builder canvas, preview
      // panes), since `flex: 1` does nothing without a flex parent.
      className={cn('flex-1', className)}
    >
      {theme.customCss && <style>{theme.customCss}</style>}
      {children}
    </div>
  )
}
