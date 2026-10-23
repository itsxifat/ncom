import type { SectionConfig } from '../sections/types'
import { PAGE_FORMAT, type PageSpec, type SectionSpec } from './format'
import { STYLE_KEYS } from './style-keys'

/**
 * A page as NCOM sends it out to be edited — to our AI builder, to an AI code
 * editor over MCP, or inside a prompt the merchant copies.
 *
 * The same shape a design comes back in, so "change this page" is a round
 * trip: each section carries its id, and an answer that keeps the id updates
 * that section instead of replacing it. Only the section design a design can
 * set travels in `style`; per-element styling stays behind, untouched.
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
  return {
    id: section.id,
    type: section.type,
    content: (section.content ?? {}) as Record<string, unknown>,
    ...(Object.keys(style).length > 0 && { style }),
    ...(section.isVisible === false && { hidden: true }),
  }
}

export function exportPage(page: {
  title: string
  sections: ExportableSection[]
}): PageSpec {
  return {
    format: PAGE_FORMAT,
    title: page.title,
    sections: page.sections.map(exportSection),
  }
}
