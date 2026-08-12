export interface PageTheme {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  headingFont: string
  bodyFont: string
  buttonStyle: 'SOLID' | 'OUTLINE' | 'GHOST'
  borderRadius: string
  spacingScale: string
  containerWidth: string
  customCss?: string | null

  /**
   * Brand and layout, all optional so a PageVersion snapshot written before
   * these existed still parses. The renderer falls back to sensible defaults
   * rather than failing on an older snapshot.
   */
  logoUrl?: string | null
  logoWidth?: number | null
  faviconUrl?: string | null
  headingWeight?: string | null
  bodyScale?: string | null
  sectionSpacing?: string | null
  showStickyHeader?: boolean | null
}

/**
 * Per-section design overrides.
 *
 * Every field is optional and falls back to the page theme, which is what
 * makes this safe to extend: a PageVersion snapshot written before a field
 * existed still parses, and a section that sets nothing looks exactly like the
 * theme intends. That fallback rule is the contract — never give a field a
 * hard default here that would override the theme for existing sections.
 *
 * Spacing and sizing are stored as plain numbers with a known unit rather than
 * CSS strings, so the editor can show a slider and the renderer cannot be fed
 * arbitrary CSS through a value that looks like a length.
 */
export interface SectionConfig {
  // ── Background ──────────────────────────────────────────────────────
  backgroundVariant?: 'default' | 'muted' | 'primary' | 'dark' | 'custom'
  /** Used only when backgroundVariant is 'custom'. */
  backgroundColor?: string
  backgroundImageUrl?: string
  backgroundSize?: 'cover' | 'contain' | 'auto'
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  /** 0–100. Darkens a background image so text stays readable over it. */
  backgroundOverlay?: number

  // ── Layout ──────────────────────────────────────────────────────────
  alignment?: 'left' | 'center' | 'right'
  /** rem. Falls back to the theme's spacing scale when unset. */
  paddingTop?: number
  paddingBottom?: number
  /** px. Overrides the theme container width for this section only. */
  maxWidth?: number
  fullWidth?: boolean

  // ── Typography & colour ─────────────────────────────────────────────
  textColor?: string
  headingColor?: string

  // ── Borders ─────────────────────────────────────────────────────────
  borderRadius?: number
  borderTop?: boolean
  borderBottom?: boolean

  // ── Visibility ──────────────────────────────────────────────────────
  hideOnMobile?: boolean
  hideOnDesktop?: boolean

  // ── Advanced ────────────────────────────────────────────────────────
  /** Becomes the element id, so nav links can jump to this section. */
  anchorId?: string
  /** Extra class names, for use with the store's custom CSS. */
  customClassName?: string
}
