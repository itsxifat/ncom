import type { SiteLanguage } from '../sections/language'
import type { SiteTemplate, TemplateSection } from './types'

/**
 * Template copy in both of a site's languages.
 *
 * A template's words are written once, side by side — `L('Shop now', 'এখনই
 * কিনুন')` — rather than as two templates, so every design exists in English
 * and in Bangla and the two can never drift into different layouts. The pair is
 * resolved to one string before anything is stored or rendered: a stored
 * section only ever holds the words of its site's language.
 */
export interface Localized {
  readonly __localized: true
  readonly en: string
  readonly bn: string
}

export function L(en: string, bn: string): Localized {
  return { __localized: true, en, bn }
}

export function isLocalized(value: unknown): value is Localized {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __localized?: unknown }).__localized === true
  )
}

/**
 * Replaces every `L(…)` pair anywhere inside a value with its words in one
 * language. Plain values pass through untouched, so a template that has not
 * been translated yet still resolves — to its English.
 */
export function resolveLocalized<T>(value: T, language: SiteLanguage): T {
  if (isLocalized(value)) return value[language] as T
  if (Array.isArray(value)) {
    return value.map((item) => resolveLocalized(item, language)) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = resolveLocalized(entry, language)
    }
    return out as T
  }
  return value
}

/** A template section with its words in one language. */
export function localizeSection(
  section: TemplateSection,
  language: SiteLanguage
): TemplateSection {
  return resolveLocalized(section, language)
}

/**
 * A template as a site in one language is made from it: every page's words
 * resolved, the theme's Bangla overrides (fonts that can set Bangla, mostly)
 * applied, and the language recorded on the theme so the storefront's own
 * words follow.
 */
export function localizeTemplate(
  template: SiteTemplate,
  language: SiteLanguage
): SiteTemplate {
  const { bangla, ...theme } = template.theme
  return {
    ...template,
    theme: {
      ...theme,
      ...(language === 'bn' ? bangla : undefined),
      language,
      numerals:
        language === 'bn'
          ? (template.theme.bangla?.numerals ?? theme.numerals ?? 'bangla')
          : 'latin',
    },
    pages: template.pages.map((page) => ({
      ...page,
      title: resolveLocalized(page.title, language),
      sections: page.sections.map((section) =>
        localizeSection(section, language)
      ),
    })),
  }
}

/** One piece of template copy as a plain string in one language. */
export function textIn(value: string | Localized, language: SiteLanguage) {
  return isLocalized(value) ? value[language] : value
}
