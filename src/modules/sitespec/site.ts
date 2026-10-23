import { slugify } from '@/lib/slug'
import type { SiteLanguage } from '../sections/language'
import type { PageRole, SiteKind } from '../sections/storefront'
import { STORE_ROUTE_SEGMENTS } from '../sections/storefront'
import { BLANK_LANDING, BLANK_STORE } from '../templates'
import type {
  SiteTemplate,
  TemplatePage,
  TemplateTheme,
} from '../templates/types'
import type { PageSpec, SectionSpec, SiteSpec } from './format'
import {
  normalizePageSections,
  normalizeTheme,
  orderLayout,
  type DesignIssue,
  type NormalizedSection,
} from './normalize'

/**
 * A whole site's design, made into a template a site can be created from.
 *
 * The result goes through `createStore` exactly as a gallery template does, so
 * a site an AI designed is provisioned like any other: commerce, delivery
 * charges, cash on delivery, and the store's product and category pages — the
 * last two from the blank store's designs when the AI did not write them,
 * because a shop that cannot show a product is not a shop.
 */

export interface SiteDesignResult {
  template: SiteTemplate
  /** The name the design suggested, for the "name your site" step. */
  suggestedName: string | null
  issues: DesignIssue[]
  /**
   * False when not one page of the design could be used, so the template
   * holds only the blank start. Callers reading a design to show or create
   * treat that as a failed read: the AI builder asks again, the paste box says
   * why, rather than offering an empty site as "your design".
   */
  usable: boolean
}

function toTemplateSections(sections: NormalizedSection[]) {
  return sections.map((section) => ({
    type: section.type,
    content: section.content,
    config: section.isVisible
      ? section.config
      : // A hidden section keeps its design; visibility travels separately
        // through the builder. Templates have no hidden flag, so a hidden
        // section simply arrives hidden on phones and computers alike.
        { ...section.config, hideOnMobile: true, hideOnDesktop: true },
  }))
}

function pageSlug(page: PageSpec, index: number, taken: Set<string>): string {
  const reserved = new Set<string>(STORE_ROUTE_SEGMENTS)
  const base =
    slugify(page.slug ?? '') || slugify(page.title ?? '') || `page-${index + 1}`
  let slug = reserved.has(base) ? `${base}-page` : base
  let counter = 2
  while (taken.has(slug)) slug = `${base}-${counter++}`
  taken.add(slug)
  return slug
}

function rolePage(
  base: SiteTemplate,
  role: PageRole
): TemplatePage | undefined {
  return base.pages.find((page) => page.role === role)
}

/** Whether any of the sections came from the design, not only from the page's rules. */
function anyFromDesign(sections: NormalizedSection[]): boolean {
  return sections.some((section) => !section.added)
}

export function designSite(
  spec: SiteSpec,
  context: {
    kind: SiteKind
    language: SiteLanguage
    /** Where this design came from, for the template's key. */
    source: 'ai' | 'pasted' | 'mcp'
  }
): SiteDesignResult {
  const issues: DesignIssue[] = []
  const { kind, language } = context

  if (spec.kind && spec.kind !== kind) {
    issues.push({
      level: 'info',
      where: 'Site',
      message: `The design was written for ${spec.kind === 'STORE' ? 'an online store' : 'a landing page'}; it was used for the ${kind === 'STORE' ? 'online store' : 'landing page'} you chose.`,
    })
  }

  const base = kind === 'STORE' ? BLANK_STORE : BLANK_LANDING
  const theme = normalizeTheme(spec.theme, issues)
  const pages: TemplatePage[] = []
  const layoutFromPages: NormalizedSection[] = []
  const taken = new Set<string>(['home'])

  const specPages = kind === 'LANDING' ? spec.pages.slice(0, 1) : spec.pages
  if (kind === 'LANDING' && spec.pages.length > 1) {
    issues.push({
      level: 'warning',
      where: 'Site',
      message: `A landing page site has one page, so only the first of the ${spec.pages.length} pages was used.`,
    })
  }
  if (kind === 'LANDING') {
    for (const [key, what] of [
      ['layout', 'shared header and footer'],
      ['productPage', 'product pages'],
      ['catalogPage', 'category pages'],
    ] as const) {
      if (spec[key]?.sections.length) {
        issues.push({
          level: 'info',
          where: 'Site',
          message: `A landing page site has no ${what}, so the design's "${key}" was not used.`,
        })
      }
    }
  }

  specPages.forEach((page, index) => {
    const pageIssues: DesignIssue[] = []
    const { sections, layout } = normalizePageSections(
      page.sections,
      { kind, role: 'STANDARD', language },
      pageIssues
    )
    layoutFromPages.push(...layout)
    const where = index === 0 ? 'Home page' : `Page ${index + 1}`
    issues.push(
      ...pageIssues.map((issue) => ({
        ...issue,
        where: `${where} · ${issue.where}`,
      }))
    )
    // Only an order form NCOM added is not a page the design made.
    if (!anyFromDesign(sections)) {
      issues.push({
        level: 'error',
        where,
        message: 'Nothing on this page could be used, so it was left out.',
      })
      return
    }
    pages.push({
      title:
        page.title?.trim() ||
        (index === 0
          ? language === 'bn'
            ? 'হোম'
            : 'Home'
          : `Page ${index + 1}`),
      slug: index === 0 ? 'home' : pageSlug(page, index, taken),
      isHome: index === 0,
      seo: page.seo
        ? { title: page.seo.title, description: page.seo.description }
        : undefined,
      sections: toTemplateSections(sections),
    })
  })

  const usedPages = pages.length
  if (pages.length === 0) {
    // Every page was unusable. The site is still made — from the blank
    // start — so the merchant lands in the builder rather than on an error,
    // and the issues say why it is empty.
    const home = base.pages.find((page) => page.isHome)!
    pages.push(home)
  } else if (!pages[0]!.isHome) {
    pages[0]!.isHome = true
  }

  if (kind === 'STORE') {
    pages.push(
      ...storeDesignPages(spec, base, language, layoutFromPages, issues)
    )
  }

  // The blank start's Bangla overrides (Google Sans for headings and body)
  // are laid over the theme when a Bangla site is made from the template
  // (localizeTemplate) — after the design's own theme. So they keep only what
  // the design left unset: a Bangla design that names its fonts keeps them,
  // and one that names none still gets fonts that can set Bangla.
  const designed = theme as Partial<TemplateTheme>
  const { bangla: baseBangla, ...baseTheme } = base.theme
  const bangla = Object.fromEntries(
    Object.entries(baseBangla ?? {}).filter(
      ([key]) => !Object.hasOwn(designed, key)
    )
  ) as NonNullable<TemplateTheme['bangla']>
  const template: SiteTemplate = {
    key: `${context.source}-design`,
    kind,
    name: context.source === 'ai' ? 'AI design' : 'Your design',
    description: 'A design made for this site.',
    bestFor: 'This site',
    theme: {
      ...baseTheme,
      ...designed,
      ...(Object.keys(bangla).length > 0 && { bangla }),
    },
    pages,
  }

  return {
    template,
    suggestedName: spec.name?.trim() || null,
    issues,
    usable: usedPages > 0,
  }
}

/** A store's layout, product page and category page. */
function storeDesignPages(
  spec: SiteSpec,
  base: SiteTemplate,
  language: SiteLanguage,
  layoutFromPages: NormalizedSection[],
  issues: DesignIssue[]
): TemplatePage[] {
  const out: TemplatePage[] = []

  const layoutSpecs: SectionSpec[] = spec.layout?.sections ?? []
  if (layoutSpecs.length > 0 || layoutFromPages.length > 0) {
    const layoutIssues: DesignIssue[] = []
    // `partial`, so no default header or footer is put in yet: one the
    // design wrote on a page has to be merged in first, or the default would
    // already be there and the design's own would be thrown away.
    const { sections } = normalizePageSections(
      layoutSpecs,
      { kind: 'STORE', role: 'LAYOUT', language, partial: true },
      layoutIssues
    )
    // A header the design put on the home page belongs to the layout, unless
    // the layout already has its own.
    for (const section of layoutFromPages) {
      if (!sections.some((existing) => existing.type === section.type)) {
        sections.push(section)
      } else {
        layoutIssues.push({
          level: 'info',
          where: 'Layout',
          message: `The ${section.type} written on a page was not used — the layout has its own, and every page of a store shows the same one.`,
        })
      }
    }
    // Only now the defaults, for what neither the layout nor a page gave.
    const layout = orderLayout(sections, language, layoutIssues)
    issues.push(
      ...layoutIssues.map((issue) => ({
        ...issue,
        where: `Header & footer · ${issue.where}`,
      }))
    )
    out.push({
      title: 'Header & footer',
      slug: '_layout',
      role: 'LAYOUT',
      sections: toTemplateSections(layout),
    })
  } else {
    out.push(rolePage(base, 'LAYOUT')!)
  }

  for (const [key, role, slug, title] of [
    ['productPage', 'PRODUCT', '_product', 'Product page'],
    ['catalogPage', 'CATALOG', '_catalog', 'Category page'],
  ] as const) {
    const designed = spec[key]?.sections
    if (!designed?.length) {
      out.push(rolePage(base, role)!)
      continue
    }
    const pageIssues: DesignIssue[] = []
    const { sections } = normalizePageSections(
      designed,
      { kind: 'STORE', role, language },
      pageIssues
    )
    issues.push(
      ...pageIssues.map((issue) => ({
        ...issue,
        where: `${title} · ${issue.where}`,
      }))
    )
    if (!anyFromDesign(sections)) {
      // Only the block NCOM put in: the standard design is the better start.
      issues.push({
        level: 'error',
        where: title,
        message:
          'Nothing in its design could be used, so it keeps the standard design.',
      })
      out.push(rolePage(base, role)!)
      continue
    }
    out.push({ title, slug, role, sections: toTemplateSections(sections) })
  }
  return out
}
