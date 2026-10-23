import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import { BANGLA_COMPANION_PROPERTIES, fontStack } from '@/lib/fonts'
import { fontStylesheetHrefs } from '@/lib/font-stylesheet'
import { isLightColor } from '@/lib/color'
import { StoreTextProvider } from '@/modules/storefront/StoreTextProvider'
import type { PageTheme } from './types'
import { htmlLang, siteLanguage, siteNumerals } from './language'

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
    // The Bangla faces every Latin stack falls back to for Bangla letters
    // (see `Companion` in lib/fonts). Set on every storefront, not only Bangla
    // ones: an English shop with one Bangla line in its hero — the normal
    // Bangladeshi page — should set that line in a real Bangla face too, and a
    // companion costs nothing until a Bangla letter is on screen.
    ...BANGLA_COMPANION_PROPERTIES,
    '--page-radius': RADIUS_VALUES[theme.borderRadius] ?? theme.borderRadius,
    '--page-space-unit': SPACE_UNIT_VALUES[theme.spacingScale] ?? '1',
    '--page-container-width': theme.containerWidth,
    '--page-heading-weight': theme.headingWeight ?? '600',
    '--page-body-scale': theme.bodyScale ?? '1',
    '--page-section-spacing':
      SPACE_UNIT_VALUES[theme.sectionSpacing ?? 'comfortable'] ?? '1',
    '--page-logo-width': `${theme.logoWidth ?? 140}px`,
    // Text drawn on the brand colour. Derived, not chosen: a merchant who picks
    // a pale yellow for their buttons should not also have to know to pick dark
    // button text, and white on yellow is unreadable.
    '--page-on-primary': isLightColor(theme.primaryColor)
      ? '#111111'
      : '#ffffff',

    // The landing-page block aliases. Every block reads `--lp-accent` /
    // `--lp-text` rather than a `--page-*` token, which is what lets a block's
    // markup be re-skinned by the page theme alone and keeps it byte-identical
    // to the reference implementation it was ported from. They are aliases, not
    // a second source of truth: the theme row remains the only place a merchant
    // sets these.
    '--lp-accent': theme.primaryColor,
    '--lp-text': theme.textColor,
  } as CSSProperties
}

/**
 * Loads whichever of these fonts are Google Fonts families outside the
 * self-hosted catalogue, through NCOM's own font proxy.
 *
 * Catalogue families need nothing here — `next/font` already bundles them —
 * and neither does a name that is not on Google Fonts at all, so for most
 * pages this renders nothing. For the rest, React 19 hoists a
 * `<link rel="stylesheet" precedence>` into the document head from wherever
 * it is rendered, during server rendering and in the client-rendered builder
 * canvas alike, and renders one link per address however many components ask
 * for it. That is what lets each place a font name comes from simply ask for
 * its own: the live page, the previews and the canvas all load the same
 * faces without any of them knowing which head they will end up in.
 *
 * Usually one link; more only when there are more families than the proxy
 * serves from one stylesheet (see `fontStylesheetHrefs`).
 */
export function FontStylesheet({
  fonts,
}: {
  fonts: (string | null | undefined)[]
}) {
  return fontStylesheetHrefs(fonts).map((href) => (
    <link key={href} rel="stylesheet" href={href} precedence="default" />
  ))
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
  const language = siteLanguage(theme)
  return (
    <div
      data-page-theme=""
      // Screen readers pick their voice from this, and browsers their
      // line-breaking and hyphenation rules — Bangla read in an English voice
      // is gibberish to the shopper who needs it read aloud.
      lang={htmlLang(language)}
      style={{
        ...themeToCssProperties(theme),
        backgroundColor: 'var(--page-background)',
        color: 'var(--page-text)',
        fontFamily: 'var(--page-font-body)',
        /*
         * The storefront's own colour scheme, read from its background.
         *
         * `color-scheme` decides how the browser paints the parts of a control
         * it owns — a text field's inner surface, its caret, autofill,
         * scrollbars. Left alone it inherits from NCOM's <html>, which carries
         * the *merchant's workspace* preference: a merchant working in dark
         * mode saw their order form's fields painted dark inside the builder
         * canvas, while every visitor — who has no such preference — got the
         * light ones. Same markup, two different pages, and nothing in the
         * editor to explain it.
         *
         * Derived rather than hard-coded to `light`, so a merchant who builds a
         * genuinely dark storefront gets dark form chrome on a real phone too.
         */
        colorScheme: isLightColor(theme.backgroundColor) ? 'light' : 'dark',
      }}
      // `flex-1` so a merchant's background always reaches the bottom of the
      // viewport. NCOM's own <html> carries `dark`, which makes `body` ink — and
      // on a storefront shorter than the window, that ink would otherwise show
      // below the content as a black band under a light-themed store. Inert
      // wherever this renders outside a flex column (the builder canvas, preview
      // panes), since `flex: 1` does nothing without a flex parent.
      className={cn('flex-1', className)}
    >
      <FontStylesheet fonts={[theme.headingFont, theme.bodyFont]} />
      {theme.customCss && <style>{theme.customCss}</style>}
      <StoreTextProvider language={language} numerals={siteNumerals(theme)}>
        {children}
      </StoreTextProvider>
    </div>
  )
}
