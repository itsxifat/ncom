import { getSectionDefinition, localizedDefaults } from '../sections/registry'
import type { SiteLanguage } from '../sections/language'
import { resolveLocalized } from './localize'
import type { TemplateSection } from './types'

/**
 * A template section as it is stored: the block's defaults in the site's
 * language with the template's words laid over them, parsed by the block's own
 * schema, so a template can never write content its block would refuse.
 *
 * The one conversion every path uses — a new site, a new page from a starter,
 * the gallery's previews, a design an AI wrote — so what a merchant previews is
 * what they get.
 */
export function materializeSection(
  section: TemplateSection,
  language: SiteLanguage = 'en'
): {
  type: string
  content: object
  config: object
} {
  const definition = getSectionDefinition(section.type)
  if (!definition) {
    throw new Error(
      `Template names a block that does not exist: ${section.type}`
    )
  }
  const defaults = localizedDefaults(definition, language)
  const parsed = definition.schema.safeParse({
    ...defaults,
    ...resolveLocalized(section.content ?? {}, language),
  })
  return {
    type: section.type,
    content: (parsed.success ? parsed.data : defaults) as object,
    config: (section.config ?? {}) as object,
  }
}
