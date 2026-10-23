import type { SiteLanguage } from '../sections/language'
import type { PageRole, SiteKind } from '../sections/storefront'
import { classifyDesign, type PageSpec, type SiteSpec } from './format'
import {
  normalizePageSections,
  normalizeTheme,
  type DesignIssue,
  type NormalizedSection,
  type ThemeDesign,
} from './normalize'
import { extractJson } from './parse'
import { designSite, type SiteDesignResult } from './site'

/**
 * From an answer — text or already-parsed JSON — to a design NCOM can use.
 *
 * Two entry points, one per thing a design can become: a whole new site, or
 * the sections of a page that already exists. Either accepts either shape of
 * answer, because the merchant does not know the difference between a "site"
 * and a "page" answer and should not have to: a page answer becomes a site
 * with one page, and a site answer pasted into a page gives that page its home
 * page.
 */

export type ReadFailure = { ok: false; message: string }

function parseValue(
  input: unknown
): { ok: true; value: unknown } | ReadFailure {
  if (typeof input !== 'string') return { ok: true, value: input }
  return extractJson(input)
}

export function readSiteDesign(
  input: unknown,
  context: {
    kind: SiteKind
    language: SiteLanguage
    source: 'ai' | 'pasted' | 'mcp'
  }
): ({ ok: true } & SiteDesignResult) | ReadFailure {
  const parsed = parseValue(input)
  if (!parsed.ok) return parsed
  const design = classifyDesign(parsed.value)
  if (design.kind === 'invalid') return { ok: false, message: design.message }

  const spec: SiteSpec =
    design.kind === 'site'
      ? design.spec
      : { pages: [design.spec as PageSpec], name: undefined }
  const result = designSite(spec, context)
  const issues = [...design.issues, ...result.issues]
  if (!result.usable) {
    return {
      ok: false,
      message:
        issues.find((issue) => issue.level === 'error')?.message ??
        'Nothing in that design could be used to make a site.',
    }
  }
  return { ok: true, ...result, issues }
}

export interface PageDesignResult {
  ok: true
  title: string | null
  seo: { title?: string; description?: string } | null
  sections: NormalizedSection[]
  /** Header, footer or announcement the design included, for a store's layout. */
  layout: NormalizedSection[]
  /** The theme the design asked for, if any — applied only when asked to. */
  theme: ThemeDesign | null
  issues: DesignIssue[]
}

export function readPageDesign(
  input: unknown,
  context: {
    kind: SiteKind
    role: PageRole
    language: SiteLanguage
    /** Adding to an existing page rather than making a whole one. */
    partial?: boolean
  }
): PageDesignResult | ReadFailure {
  const parsed = parseValue(input)
  if (!parsed.ok) return parsed
  const design = classifyDesign(parsed.value)
  if (design.kind === 'invalid') return { ok: false, message: design.message }

  const issues: DesignIssue[] = [...design.issues]
  let page: PageSpec
  let layoutSections: SiteSpec['layout'] = undefined
  let themeSpec: unknown
  if (design.kind === 'site') {
    page = design.spec.pages[0]!
    layoutSections = design.spec.layout
    themeSpec = design.spec.theme
    if (design.spec.pages.length > 1) {
      issues.push({
        level: 'info',
        where: 'Design',
        message: `The design had ${design.spec.pages.length} pages; this page took the first one.`,
      })
    }
  } else {
    page = design.spec
    themeSpec = (design.spec as Record<string, unknown>).theme
  }

  const { sections, layout } = normalizePageSections(
    [...(layoutSections?.sections ?? []), ...page.sections],
    context,
    issues
  )
  const theme = themeSpec ? normalizeTheme(themeSpec, issues) : null

  // Counted from the design alone. A landing page always gets its order form
  // and a product page its details, so counting those too would make a design
  // whose every section was refused look like a page — and saving it in
  // place of the old one would empty the page.
  if (!sections.some((section) => !section.added) && layout.length === 0) {
    return {
      ok: false,
      message:
        issues.find((issue) => issue.level === 'error')?.message ??
        'Nothing in that design could be used on this page.',
    }
  }

  return {
    ok: true,
    title: page.title?.trim() || null,
    seo: page.seo
      ? { title: page.seo.title, description: page.seo.description }
      : null,
    sections,
    layout,
    theme: theme && Object.keys(theme).length > 0 ? theme : null,
    issues,
  }
}
