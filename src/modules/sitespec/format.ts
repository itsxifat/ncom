import { z } from 'zod'
import type { DesignIssue } from './normalize'

/**
 * The NCOM design format: a website, or one page of it, as plain JSON.
 *
 * One format for every way a design arrives from outside the builder — the AI
 * builder's own answer, an answer a merchant pastes back from ChatGPT or
 * Gemini after giving it our prompt, and the pages an AI code editor writes
 * over MCP. Each of those is a model writing JSON from instructions, so they
 * all get the same instructions (guide.ts), the same block catalogue
 * (catalog.ts) and the same repair-don't-reject validation (normalize.ts).
 *
 * The shapes here are deliberately loose. They check only the skeleton —
 * there is a list of sections, each an object — and leave everything else to
 * normalize.ts, because a model that gets one field wrong should cost the
 * merchant that field, not the whole page. Nothing in a design that has a list
 * of sections or pages is refused here: a title that is too long is cut, a
 * list that is too long keeps its start, a section that is not a section is
 * left for normalize.ts to report in its place, and every one of those says so.
 */

export const PAGE_FORMAT = 'ncom/page@1'
export const SITE_FORMAT = 'ncom/site@1'

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Text with any half of an emoji (a lone surrogate) replaced. A design can
 * carry one — a model's `"\ud83d"` escape, or a cut in the wrong place — and
 * Postgres refuses to store it, which would fail the whole save.
 */
export function wellFormed(value: string): string {
  return value.replace(LONE_SURROGATE, '\uFFFD')
}

/**
 * `value` cut to at most `max` UTF-16 units — what zod's `.max()` counts —
 * without splitting an emoji or another character stored as a surrogate pair:
 * half of one is not text, and Postgres refuses to store it.
 */
export function cutText(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * A name or title: trimmed and cut to length rather than refused — a page
 * title three words too long is not worth the page. Anything that is not text
 * counts as left out.
 */
function looseText(max: number) {
  return z
    .unknown()
    .transform((value) => {
      const text =
        typeof value === 'string'
          ? value
          : typeof value === 'number'
            ? String(value)
            : ''
      return cutText(wellFormed(text).trim(), max).trimEnd() || undefined
    })
    .optional()
}

export const sectionSpecSchema = z
  .object({
    /** A block key from the catalogue, e.g. `hero`, `orderform`. */
    type: z.unknown().optional(),
    /** The block's fields. Anything left out keeps the block's default. */
    content: z.unknown().optional(),
    /** Section-level design: background, spacing, alignment. */
    style: z.unknown().optional(),
    /**
     * Each of the block's elements designed on its own — a headline's type,
     * a button's colours and hover, a card's shadow — keyed by the element
     * names the catalogue lists. See element-design.ts.
     */
    elements: z.unknown().optional(),
    /** Headings, text, buttons, pictures and icons added to the block. */
    extras: z.unknown().optional(),
    /** Present on the page but hidden from visitors. */
    hidden: z.unknown().optional(),
  })
  .loose()

export type SectionSpec = z.infer<typeof sectionSpecSchema>

/**
 * A list of sections. A bare block name (`"faq"`) is that block with its
 * defaults. Anything else that is not an object becomes an empty section
 * rather than failing the list, so normalize.ts reports it under its own
 * number and leaves only it out.
 */
const sectionList = z
  .array(z.unknown())
  .transform((items) =>
    items.map((item) =>
      typeof item === 'string' ? { type: item } : isRecord(item) ? item : {}
    )
  )
  .pipe(z.array(sectionSpecSchema))

const seoSpecSchema = z
  .object({
    title: looseText(300),
    description: looseText(1000),
  })
  .loose()
  .optional()
  .catch(undefined)

export const pageSpecSchema = z
  .object({
    format: z.string().optional().catch(undefined),
    title: looseText(150),
    slug: looseText(100),
    seo: seoSpecSchema,
    /**
     * The whole site's look, from a page answer: one page cannot have a theme
     * of its own, so this changes every page. Validated in normalize.ts.
     */
    theme: z.unknown().optional(),
    sections: sectionList,
  })
  .loose()

export type PageSpec = z.infer<typeof pageSpecSchema>

/** A page of a site, where a page with no list of sections is simply empty. */
const sitePageSchema = pageSpecSchema.extend({
  sections: sectionList.catch([]),
})

/**
 * The layout, product page or category page of a store: `{ sections: [...] }`,
 * or — as models sometimes write it — just the list.
 */
const sectionGroup = z
  .preprocess(
    (value) => (Array.isArray(value) ? { sections: value } : value),
    z.object({ sections: sectionList }).loose()
  )
  .optional()
  .catch(undefined)

function siteKindOf(value: unknown): 'LANDING' | 'STORE' | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.toLowerCase().replace(/[^a-z]/g, '')
  if (key === 'landing' || key === 'landingpage') return 'LANDING'
  if (key === 'store' || key === 'onlinestore' || key === 'shop') return 'STORE'
  return undefined
}

function languageOf(value: unknown): 'en' | 'bn' | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  if (
    key.startsWith('bn') ||
    key === 'bangla' ||
    key === 'bengali' ||
    key === 'বাংলা'
  ) {
    return 'bn'
  }
  if (key.startsWith('en')) return 'en'
  return undefined
}

export const siteSpecSchema = z
  .object({
    format: z.string().optional().catch(undefined),
    /** Read loosely ("landing", "Store"); the site's kind is chosen by the merchant anyway. */
    kind: z.unknown().transform(siteKindOf).optional(),
    name: looseText(100),
    language: z.unknown().transform(languageOf).optional(),
    /** The theme fields a design may set. Validated properly in normalize.ts. */
    theme: z.unknown().optional(),
    /** An online store's header, announcement bar and footer. */
    layout: sectionGroup,
    /** The site's pages, home page first. A landing site has exactly one. */
    pages: z
      .array(z.unknown())
      .transform((pages) => pages.map((page) => (isRecord(page) ? page : {})))
      .pipe(z.array(sitePageSchema)),
    /** An online store's product page design. */
    productPage: sectionGroup,
    /** An online store's category / search results page design. */
    catalogPage: sectionGroup,
  })
  .loose()

export type SiteSpec = z.infer<typeof siteSpecSchema>

/** The most of each list a design may hold; the rest is left out, with a note. */
const MAX_PAGES = 12
const MAX_SECTIONS = 60
const MAX_LAYOUT_SECTIONS = 10
const MAX_ROLE_PAGE_SECTIONS = 20

/**
 * Something someone pasted: a whole site, one page, or just a list of
 * sections. Told apart by shape rather than by trusting the `format` field,
 * because a model asked for one page sometimes wraps it as a site and
 * sometimes drops the wrapper altogether. `issues` says what was cut or left
 * out on the way.
 */
export type ParsedDesign =
  | { kind: 'site'; spec: SiteSpec; issues: DesignIssue[] }
  | { kind: 'page'; spec: PageSpec; issues: DesignIssue[] }

export function classifyDesign(
  value: unknown
): ParsedDesign | { kind: 'invalid'; message: string } {
  if (Array.isArray(value)) return classifyDesign({ sections: value })
  if (!isRecord(value)) {
    return {
      kind: 'invalid',
      message: 'The answer is not a JSON object with sections in it.',
    }
  }
  const issues: DesignIssue[] = []
  if (Array.isArray(value.pages)) {
    if (value.pages.length === 0) {
      return {
        kind: 'invalid',
        message:
          'The design’s "pages" list is empty — it needs at least the home page.',
      }
    }
    for (const key of ['layout', 'productPage', 'catalogPage'] as const) {
      const group = value[key]
      if (group === undefined || group === null) continue
      if (
        Array.isArray(group) ||
        (isRecord(group) && Array.isArray(group.sections))
      )
        continue
      issues.push({
        level: 'warning',
        where: 'Site',
        message: `Ignored "${key}" — it needs a "sections" list.`,
      })
    }
    const site = siteSpecSchema.safeParse(value)
    if (!site.success)
      return { kind: 'invalid', message: describeShapeError(site.error) }
    const spec = site.data
    spec.pages = capped(spec.pages, MAX_PAGES, 'Site', 'pages', issues)
    spec.pages.forEach((page, index) => {
      page.sections = capped(
        page.sections,
        MAX_SECTIONS,
        index === 0 ? 'Home page' : `Page ${index + 1}`,
        'sections',
        issues
      )
    })
    for (const [key, max, where] of [
      ['layout', MAX_LAYOUT_SECTIONS, 'Header & footer'],
      ['productPage', MAX_ROLE_PAGE_SECTIONS, 'Product page'],
      ['catalogPage', MAX_ROLE_PAGE_SECTIONS, 'Category page'],
    ] as const) {
      const group = spec[key]
      if (group)
        group.sections = capped(group.sections, max, where, 'sections', issues)
    }
    return { kind: 'site', spec, issues }
  }
  if (Array.isArray(value.sections)) {
    const page = pageSpecSchema.safeParse(value)
    if (!page.success)
      return { kind: 'invalid', message: describeShapeError(page.error) }
    const spec = page.data
    spec.sections = capped(
      spec.sections,
      MAX_SECTIONS,
      'Page',
      'sections',
      issues
    )
    return { kind: 'page', spec, issues }
  }
  // `{ "page": { ... } }` — a wrapper some models add.
  if (value.page && typeof value.page === 'object')
    return classifyDesign(value.page)
  return {
    kind: 'invalid',
    message:
      'The answer has no "sections" list (for one page) or "pages" list (for a whole site).',
  }
}

/** The first `max` of a list, saying so when there were more. */
function capped<T>(
  list: T[],
  max: number,
  where: string,
  what: string,
  issues: DesignIssue[]
): T[] {
  if (list.length <= max) return list
  issues.push({
    level: 'warning',
    where,
    message: `Only the first ${max} ${what} were used — the design had ${list.length}, more than fit.`,
  })
  return list.slice(0, max)
}

function describeShapeError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'The design is not in the expected shape.'
  const where = issue.path.length ? ` at ${issue.path.join('.')}` : ''
  return `The design is not in the expected shape${where}: ${issue.message}`
}
