import type { SectionConfig } from '../sections/types'
import type { PageRole, SiteKind } from '../sections/storefront'
import type { SiteLanguage, SiteNumerals } from '../sections/language'
import type { Localized } from './localize'

/**
 * A starter design: a whole site a merchant can begin from in one click.
 *
 * Templates live in code beside the blocks they are made of, for the same
 * reason the blocks do: a template is a list of blocks with some words and
 * colours in them, and keeping it next to the block definitions means a
 * template can never name a block that does not exist or a field a block does
 * not have without the type checker saying so at the call site.
 *
 * A template is copied, never referenced. Choosing one writes ordinary pages
 * and sections into the new site, which the merchant then owns outright —
 * changing a template later changes the next site made from it, not the ones
 * already made.
 */

export interface TemplateSection {
  /** A block key from modules/sections/registry.ts. */
  type: string
  /**
   * Merged over the block's defaults, so a template says only what differs.
   * Words may be written as `L(english, bangla)` pairs; see localize.ts.
   */
  content?: Record<string, unknown>
  config?: SectionConfig
}

export interface TemplatePage {
  title: string | Localized
  slug: string
  role?: PageRole
  isHome?: boolean
  /** Search-result title and description, when the design wrote them. */
  seo?: { title?: string; description?: string }
  sections: TemplateSection[]
}

/** The theme columns a template sets. Anything left out keeps the default. */
export interface TemplateTheme {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  headingFont: string
  bodyFont: string
  buttonStyle?: 'SOLID' | 'OUTLINE' | 'GHOST'
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  headingWeight?: string
  containerWidth?: string
  /**
   * The rest of the Design tab, which a design written for the site may set
   * and a gallery template leaves to the defaults.
   */
  spacingScale?: string
  sectionSpacing?: string
  bodyScale?: string
  showStickyHeader?: boolean
  logoUrl?: string
  logoWidth?: number
  faviconUrl?: string
  customCss?: string
  /** Set by `localizeTemplate`; a template itself leaves these out. */
  language?: SiteLanguage
  numerals?: SiteNumerals
  /**
   * What changes when the site is in Bangla — usually the fonts, because a
   * Latin display face has no Bangla letters and the browser would set the
   * headline in whatever system font it finds.
   */
  bangla?: Partial<Omit<TemplateTheme, 'bangla' | 'language'>>
}

export interface SiteTemplate {
  key: string
  kind: SiteKind
  name: string
  /** One sentence on what it looks like. */
  description: string
  /** Who it suits, in the merchant's words: "Clothing, shoes, bags". */
  bestFor: string
  theme: TemplateTheme
  pages: TemplatePage[]
}
