import type { ElementDesignMap } from './elementStyle'
import type { ExtraElement } from './elementDescriptors'

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
  /**
   * Per-section typeface overrides, as family names from `lib/fonts.ts`.
   *
   * Unset means the page theme's font, per the inheritance contract above.
   * Stored as the family name rather than a resolved `font-family` stack for
   * the same reason the theme does: the stack is derived at render time, so a
   * section keeps naming the face the merchant picked even if the catalogue is
   * reordered, and an unrecognised name can never become raw CSS.
   */
  headingFont?: string
  bodyFont?: string

  // ── Borders ─────────────────────────────────────────────────────────
  borderRadius?: number
  borderTop?: boolean
  borderBottom?: boolean

  // ── Visibility ──────────────────────────────────────────────────────
  hideOnMobile?: boolean
  hideOnDesktop?: boolean

  // ── Per-element design ──────────────────────────────────────────────
  /**
   * How each individual thing inside this block looks, keyed by the element
   * key the block declares in its `elements` descriptor list.
   *
   * This is the layer below everything above it. The fields above style the
   * section *wrapper* — one background, one padding, one text colour for the
   * whole block — while this reaches each headline, button, card and image the
   * block draws, per breakpoint, with a hover state and an entrance animation.
   *
   * Same inheritance contract as the rest of this interface, one level deeper:
   * a property nobody set produces no CSS at all, so the block's own classes
   * and the page theme keep painting it. That is what makes this safe to add to
   * pages that already exist, and what makes "reset" a delete.
   */
  elements?: ElementDesignMap

  /**
   * Elements a merchant added to this block that its author did not put there
   * — a second button, a badge, a spacer.
   *
   * They live in the config rather than in `content` because they are not part
   * of what the block *means*: the block's zod schema describes the data it
   * sells with, and an extra decoration is not that. Keeping them here also
   * means adding one never invalidates a content schema, so a page published
   * with extras still parses against a block definition that knows nothing
   * about them.
   */
  extras?: ExtraElement[]

  // ── Advanced ────────────────────────────────────────────────────────
  /** Becomes the element id, so nav links can jump to this section. */
  anchorId?: string
  /** Extra class names, for use with the store's custom CSS. */
  customClassName?: string
}
