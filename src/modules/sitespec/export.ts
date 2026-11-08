import type { PageTheme, SectionConfig } from '../sections/types'
import { PAGE_FORMAT, type PageSpec, type SectionSpec } from './format'
import type { ThemeDesign } from './normalize'
import { STYLE_KEYS } from './style-keys'

/**
 * A page as NCOM sends it out to be edited — to our AI builder, to an AI code
 * editor over MCP, or inside a prompt the merchant copies.
 *
 * The same shape a design comes back in, so "change this page" is a round
 * trip: each section carries its id, and an answer that keeps the id updates
 * that section instead of replacing it. The section design a design can set
 * travels in `style`, each element's design in `elements` and the elements
 * added to the block in `extras` — everything the builder can change, so a
 * model can change all of it and sees what it is changing.
 */

export interface ExportableSection {
  id: string
  type: string
  content: unknown
  config?: SectionConfig | null
  isVisible?: boolean
}

export function exportSection(section: ExportableSection): SectionSpec {
  const style: Record<string, unknown> = {}
  for (const key of STYLE_KEYS) {
    const value = section.config?.[key]
    if (value !== undefined && value !== null && value !== '')
      style[key] = value
  }
  const elements = section.config?.elements
  const extras = section.config?.extras
  return {
    id: section.id,
    type: section.type,
    content: (section.content ?? {}) as Record<string, unknown>,
    ...(Object.keys(style).length > 0 && { style }),
    ...(elements &&
      typeof elements === 'object' &&
      Object.keys(elements).length > 0 && { elements }),
    ...(Array.isArray(extras) && extras.length > 0 && { extras }),
    ...(section.isVisible === false && { hidden: true }),
  }
}

/**
 * The theme fields a design may set, as the site has them now — so a page
 * sent out to be changed shows the colours, fonts and custom CSS it is drawn
 * with, and an answer can keep or change them knowingly.
 */
export function exportTheme(
  theme: Partial<PageTheme> | null | undefined
): ThemeDesign | undefined {
  if (!theme) return undefined
  const out: Record<string, unknown> = {}
  const keys = [
    'primaryColor',
    'secondaryColor',
    'backgroundColor',
    'textColor',
    'headingFont',
    'bodyFont',
    'buttonStyle',
    'borderRadius',
    'headingWeight',
    'containerWidth',
    'spacingScale',
    'sectionSpacing',
    'bodyScale',
    'showStickyHeader',
    'logoUrl',
    'logoWidth',
    'faviconUrl',
    'customCss',
    'numerals',
  ] as const satisfies readonly (keyof ThemeDesign & keyof PageTheme)[]
  for (const key of keys) {
    const value = theme[key]
    if (value !== undefined && value !== null && value !== '') out[key] = value
  }
  return Object.keys(out).length > 0 ? (out as ThemeDesign) : undefined
}

export function exportPage(page: {
  title: string
  sections: ExportableSection[]
  theme?: Partial<PageTheme> | null
}): PageSpec {
  const theme = exportTheme(page.theme)
  return {
    format: PAGE_FORMAT,
    title: page.title,
    ...(theme && { theme }),
    sections: page.sections.map(exportSection),
  }
}
