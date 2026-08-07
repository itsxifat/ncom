import type { CSSProperties } from 'react'
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
 * Maps a project's ThemeSettings row to CSS custom properties, namespaced
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
    '--page-font-heading': `"${theme.headingFont}", ui-sans-serif, system-ui, sans-serif`,
    '--page-font-body': `"${theme.bodyFont}", ui-sans-serif, system-ui, sans-serif`,
    '--page-radius': RADIUS_VALUES[theme.borderRadius] ?? theme.borderRadius,
    '--page-space-unit': SPACE_UNIT_VALUES[theme.spacingScale] ?? '1',
    '--page-container-width': theme.containerWidth,
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
      className={className}
    >
      {theme.customCss && <style>{theme.customCss}</style>}
      {children}
    </div>
  )
}
