import { getSectionDefinition } from '../sections/registry'
import type { RenderablePageSection } from '../sections/PageRenderer'
import type { PageTheme } from '../sections/types'
import type {
  StoreProductCard,
  StorefrontContext,
} from '../sections/storefront'
import { DEFAULT_THEME } from '@/lib/default-theme'
import {
  SAMPLE_CATEGORIES,
  sampleCardsFor,
  sampleListing,
  sampleProductDetail,
} from '../storefront/sample'
import type { SiteTemplate, TemplatePage, TemplateSection } from './types'
import type { SiteLanguage } from '../sections/language'
import { materializeSection } from './materialize'
import { localizeTemplate } from './localize'

/**
 * A template drawn without a store behind it — for the gallery's thumbnails
 * and its full-size preview.
 *
 * The sections are built exactly as creating a site from the template builds
 * them (block defaults with the template's words laid over, parsed by the
 * block's schema), so the preview cannot show a page the real site would not
 * be. The products are the made-up samples from storefront/sample.ts.
 */

export type PreviewPage = 'home' | 'product' | 'catalog'

function sectionFrom(
  section: TemplateSection,
  id: string,
  order: number,
  language: SiteLanguage
): RenderablePageSection & { type: string } {
  return {
    id,
    order,
    isVisible: true,
    ...materializeSection(section, language),
  }
}

function pageFor(template: SiteTemplate, which: PreviewPage): TemplatePage {
  const role =
    which === 'product' ? 'PRODUCT' : which === 'catalog' ? 'CATALOG' : null
  return (
    (role && template.pages.find((page) => page.role === role)) ||
    template.pages.find((page) => page.isHome) ||
    template.pages[0]!
  )
}

export function templatePreview(
  source: SiteTemplate,
  which: PreviewPage,
  currencyCode: string,
  language: SiteLanguage = 'en'
): {
  theme: PageTheme
  top: (RenderablePageSection & { type: string })[]
  sections: (RenderablePageSection & { type: string })[]
  bottom: (RenderablePageSection & { type: string })[]
  storefront: StorefrontContext | undefined
} {
  const template = localizeTemplate(source, language)
  const theme = { ...DEFAULT_THEME, ...template.theme } as PageTheme
  const page = pageFor(template, which)
  const sections = page.sections.map((section, index) =>
    sectionFrom(section, `preview-${index}`, index, language)
  )

  const layout = template.pages.find((candidate) => candidate.role === 'LAYOUT')
  const layoutSections = (layout?.sections ?? []).map((section, index) =>
    sectionFrom(section, `layout-${index}`, index, language)
  )
  const placed = (where: 'top' | 'bottom') =>
    layoutSections.filter(
      (section) => getSectionDefinition(section.type)?.placement === where
    )

  if (template.kind !== 'STORE') {
    return { theme, top: [], sections, bottom: [], storefront: undefined }
  }

  const all = [...placed('top'), ...sections, ...placed('bottom')]
  return {
    theme,
    top: placed('top'),
    sections,
    bottom: placed('bottom'),
    storefront: sampleStorefront(all, currencyCode, 'Your store'),
  }
}

/**
 * The shop around a set of sections, made of samples.
 *
 * Every block that asks for products gets the sample cards, cut to the number
 * it asked for, so a grid of eight shows eight and a row of four shows four.
 */
export function sampleStorefront(
  sections: { id: string; type: string; content: unknown }[],
  currencyCode: string,
  storeName: string,
  linkBase = ''
): StorefrontContext {
  const sectionProducts: Record<string, StoreProductCard[]> = {}
  for (const section of sections) {
    const definition = getSectionDefinition(section.type)
    if (!definition?.productQuery) continue
    const parsed = definition.schema.safeParse(section.content)
    const query = definition.productQuery(
      parsed.success ? parsed.data : definition.defaultContent
    )
    if (!query) continue
    sectionProducts[section.id] = sampleCardsFor(
      query.limit,
      currencyCode,
      query.source === 'related' ? 'sample-tee' : undefined
    )
  }

  return {
    storeName,
    currencyCode,
    linkBase,
    categories: SAMPLE_CATEGORIES,
    collections: [],
    sectionProducts,
    product: sampleProductDetail(currencyCode),
    listing: sampleListing(currencyCode),
    accountsEnabled: true,
    sample: true,
  }
}
