import 'server-only'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import {
  createStore,
  listStores,
  updateDraftTheme,
} from '@/server/services/storeService'
import {
  createPage,
  savePageSections,
  type SectionSaveInput,
} from '@/server/services/pageService'
import {
  loadStoreCatalogue,
  runProductQuery,
} from '@/server/services/storefrontService'
import { createStoreSchema } from '@/lib/validation/store-core'
import { createPageSchema } from '@/lib/validation/page'
import {
  isSiteLanguage,
  siteLanguage,
  type SiteLanguage,
} from '@/modules/sections/language'
import type { PageRole, SiteKind } from '@/modules/sections/storefront'
import {
  getSectionDefinition,
  localizedDefaults,
} from '@/modules/sections/registry'
import type { SectionConfig } from '@/modules/sections/types'
import { SITE_TEMPLATES, getTemplate, templatesFor } from '@/modules/templates'
import { designGuide } from '@/modules/sitespec/guide'
import {
  blocksFor,
  catalogText,
  contentJsonSchema,
  findBlockDoc,
} from '@/modules/sitespec/catalog'
import { exportPage, exportSection } from '@/modules/sitespec/export'
import { classifyDesign, type SectionSpec } from '@/modules/sitespec/format'
import {
  STYLE_KEYS,
  isLayoutBlock,
  normalizeSection,
  normalizeTheme,
  resolveBlockType,
  type DesignIssue,
  type NormalizedSection,
} from '@/modules/sitespec/normalize'
import { isStyleKey } from '@/modules/sitespec/style-keys'
import { extractJson } from '@/modules/sitespec/parse'
import {
  readPageDesign,
  readSiteDesign,
  type PageDesignResult,
} from '@/modules/sitespec/read'

/**
 * The tools an AI code editor gets when a merchant connects it to NCOM.
 *
 * Built so the editor's AI can do what the merchant does in the builder,
 * through the same doors: designs are read by the same repair-don't-reject
 * reader as a pasted design, sections are saved through `savePageSections`,
 * sites are created through `createStore` with its plan limits. Nothing here
 * publishes — putting a site live is recorded against the person who did it,
 * and a key is not a person — so every write is a draft, and every answer
 * carries the builder link where the merchant reviews it and presses Publish.
 *
 * Read tools need the key's SITES_READ permission; tools that change anything
 * need SITES_WRITE. Both are checked here, per tool, before it runs.
 */

export interface ToolContext {
  organizationId: string
  canWrite: boolean
}

/** A failure the calling model should read and act on. */
export class ToolError extends Error {}

type JsonSchema = Record<string, unknown>

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  write: boolean
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>
}

// ── Helpers ──────────────────────────────────────────────────────────────

const KIND = { type: 'string', enum: ['LANDING', 'STORE'] }
const ROLE = {
  type: 'string',
  enum: ['STANDARD', 'PRODUCT', 'CATALOG', 'LAYOUT'],
}
const DESIGN = {
  type: 'object',
  description:
    'A design in the NCOM format described by get_design_guide (a JSON object).',
  additionalProperties: true,
}

function string(args: Record<string, unknown>, key: string, required = true) {
  const value = args[key]
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (required) throw new ToolError(`"${key}" is required.`)
  return undefined
}

function kindArg(args: Record<string, unknown>): SiteKind {
  const kind = args.kind
  if (kind === 'LANDING' || kind === 'STORE') return kind
  throw new ToolError('"kind" must be "LANDING" or "STORE".')
}

function dashboardUrl(path: string) {
  return new URL(path, env.AUTH_URL).toString()
}

function liveUrl(subdomain: string) {
  const protocol = new URL(env.AUTH_URL).protocol
  return `${protocol}//${subdomain}.${env.ROOT_DOMAIN}`
}

function builderUrl(storeId: string, pageId: string) {
  return dashboardUrl(`/stores/${storeId}/pages/${pageId}/edit`)
}

async function requireSite(organizationId: string, siteId: string) {
  const store = await prisma.store.findFirst({
    where: { id: siteId, organizationId },
    include: { theme: true },
  })
  if (!store)
    throw new ToolError(
      `No site with id "${siteId}" in this workspace. Call list_sites.`
    )
  return store
}

async function requirePage(organizationId: string, pageId: string) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, store: { organizationId } },
    include: {
      sections: { orderBy: { order: 'asc' } },
      store: { include: { theme: true } },
    },
  })
  if (!page)
    throw new ToolError(
      `No page with id "${pageId}" in this workspace. Call list_sites.`
    )
  return page
}

function pageLinks(
  storeId: string,
  page: { id: string; previewToken: string }
) {
  return {
    builderUrl: builderUrl(storeId, page.id),
    previewUrl: dashboardUrl(`/preview/${page.previewToken}`),
  }
}

/**
 * Where the owner reviews a change to a page. A store's layout page — its
 * header and footer — has no builder of its own: the builder edits the shared
 * layout around the store's other pages and answers 404 for the layout page
 * itself. So a change to it is reviewed on the home page, which shows it.
 */
async function reviewLinks(
  storeId: string,
  page: { id: string; role: string; previewToken: string }
) {
  if (page.role !== 'LAYOUT') return pageLinks(storeId, page)
  const home = await prisma.page.findFirst({
    where: { storeId, role: 'STANDARD' },
    select: { id: true, previewToken: true },
    orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }],
  })
  return home ? pageLinks(storeId, home) : {}
}

const LANGUAGE_NAME: Record<SiteLanguage, string> = {
  en: 'English',
  bn: 'Bangla',
}

/** The templates of one kind, for the create_site schema. */
function templateList(kind: SiteKind) {
  return templatesFor(kind)
    .map((template) => `"${template.key}" (${template.bestFor})`)
    .join(', ')
}

/** A section style set to null or "": a request to remove it. */
function clearsStyle(key: string, value: unknown) {
  return (
    isStyleKey(key) &&
    (value === null || (typeof value === 'string' && value.trim() === ''))
  )
}

/** Every list of sections a design holds, wherever its shape keeps them. */
function sectionLists(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value]
  if (!isObject(value)) return []
  if (Array.isArray(value.pages)) {
    // A group may be written as { sections: [...] } or, as the reader also
    // accepts, as the bare list.
    const list = (group: unknown) =>
      Array.isArray(group) ? group : isObject(group) && group.sections
    return [
      list(value.layout),
      ...value.pages.map((page) => isObject(page) && page.sections),
      list(value.productPage),
      list(value.catalogPage),
    ].filter(Array.isArray)
  }
  if (Array.isArray(value.sections)) return [value.sections]
  if (isObject(value.page)) return sectionLists(value.page)
  return []
}

/**
 * A `design` argument, looked at once before the sitespec reader sees it, for
 * what the tools need to know about what the caller actually wrote:
 *
 * - Section styles set to null or "" are taken out. They ask for the style to
 *   be removed (see `restyle`) rather than being a value to check — and a ""
 *   would otherwise be read as 0 for a number.
 * - Which section styles each section sent, by section id and, for the shared
 *   layout's blocks, by block type: a style that was sent but was not valid
 *   keeps its old value instead of vanishing with the ones left out.
 * - The blocks the design itself put on the page, and the language it says it
 *   is written in.
 *
 * Anything that cannot be read is passed on untouched, so the reader explains
 * the problem in its own words.
 */
function prepareDesign(input: unknown) {
  const prepared = {
    value: input,
    styles: new Map<string, Set<string>>(),
    types: new Set<string>(),
    language: undefined as SiteLanguage | undefined,
  }
  const parsed =
    typeof input === 'string'
      ? extractJson(input)
      : { ok: true as const, value: input }
  if (!parsed.ok) return prepared
  const value = structuredClone(parsed.value)
  for (const list of sectionLists(value)) {
    for (const spec of list) {
      if (!isObject(spec)) continue
      const sent = new Set<string>()
      if (isObject(spec.style)) {
        for (const [key, raw] of Object.entries(spec.style)) {
          if (clearsStyle(key, raw)) delete spec.style[key]
          else sent.add(key)
        }
      }
      const byId =
        typeof spec.id === 'string' && spec.id ? `id:${spec.id}` : null
      if (byId && !prepared.styles.has(byId)) prepared.styles.set(byId, sent)
      const type = resolveBlockType(String(spec.type ?? ''))
      // The layout keeps one of each block, matched by type (see mergeLayout).
      if (type && isLayoutBlock(type) && !prepared.styles.has(`type:${type}`)) {
        prepared.styles.set(`type:${type}`, sent)
      }
    }
  }
  prepared.value = value

  const design = classifyDesign(value)
  if (design.kind === 'invalid') return prepared
  // The specs a page is read from: a site design gives its layout and first page.
  const specs: SectionSpec[] =
    design.kind === 'site'
      ? [
          ...(design.spec.layout?.sections ?? []),
          ...design.spec.pages[0]!.sections,
        ]
      : design.spec.sections
  for (const spec of specs) {
    const type = resolveBlockType(String(spec.type ?? ''))
    if (type) prepared.types.add(type)
  }
  const language = (design.spec as Record<string, unknown>).language
  if (isSiteLanguage(language)) prepared.language = language
  return prepared
}

/**
 * A rewritten section's config. What a design cannot see is kept — per-element
 * styling, extras the merchant added — and the section style is the design's:
 * a style it left out, or set to null, is removed. That is safe for a round
 * trip, because a section NCOM sends out carries every style it has
 * (export.ts), so one that comes back without a style had it taken off. A
 * style the design did send but that was not valid was ignored — the notes say
 * so — and keeps the value it had.
 */
function restyle(
  saved: unknown,
  style: SectionConfig,
  sent: ReadonlySet<string> | undefined
): SectionConfig {
  const config: Record<string, unknown> = {
    ...((saved ?? {}) as Record<string, unknown>),
  }
  for (const key of STYLE_KEYS) {
    if (sent?.has(key) && !(key in style)) continue
    delete config[key]
  }
  return { ...config, ...style } as SectionConfig
}

/**
 * The search title and description a page design wrote, saved onto the page.
 * Written directly: they are the basic SEO every plan includes, so none of
 * updatePageSeo's plan checks apply, and the caller has just been let through
 * to change this page by the save before it. Never cleared when the design
 * leaves them out — get_page does not send them, so a round trip would.
 */
async function saveSeo(
  page: { id: string; role: string },
  seo: PageDesignResult['seo'],
  issues: DesignIssue[]
) {
  const title = seo?.title?.trim()
  const description = seo?.description?.trim()
  if (!title && !description) return
  if (page.role !== 'STANDARD') {
    issues.push({
      level: 'info',
      where: 'SEO',
      message:
        "The design's SEO title and description were not used — only ordinary pages have their own; product and category pages take theirs from each product and category.",
    })
    return
  }
  // The lengths the page's SEO settings allow, as createStore cuts a template's.
  if (title && title.length > 70) {
    issues.push({
      level: 'warning',
      where: 'SEO',
      message: 'Shortened the SEO title to 70 characters.',
    })
  }
  if (description && description.length > 300) {
    issues.push({
      level: 'warning',
      where: 'SEO',
      message: 'Shortened the SEO description to 300 characters.',
    })
  }
  await prisma.page.update({
    where: { id: page.id },
    data: {
      ...(title && { seoTitle: title.slice(0, 70) }),
      ...(description && { seoDescription: description.slice(0, 300) }),
    },
  })
}

/**
 * The rows to save for a page: the design's sections, each keeping the id of
 * the section it rewrites (same block) so per-element styling the design
 * cannot see — and the section's place in history — survive.
 */
function sectionRows(
  normalized: NormalizedSection[],
  existing: {
    id: string
    type: string
    content: unknown
    config: unknown
    isVisible: boolean
  }[],
  mode: 'replace' | 'append',
  styles: Map<string, Set<string>>
): SectionSaveInput[] {
  const byId = new Map(existing.map((section) => [section.id, section]))
  const used = new Set<string>()
  const rows: Omit<SectionSaveInput, 'order'>[] =
    mode === 'append'
      ? existing.map((section) => ({
          id: section.id,
          type: section.type,
          content: section.content as object,
          config: (section.config ?? {}) as object,
          isVisible: section.isVisible,
        }))
      : []
  for (const section of normalized) {
    const reuse =
      mode === 'replace' && section.ref && !used.has(section.ref)
        ? byId.get(section.ref)
        : undefined
    const keep = reuse && reuse.type === section.type ? reuse : undefined
    if (keep) used.add(keep.id)
    // A block the reader added because the design left it out — a landing
    // page's order form, a store's header or footer — is the page's own one
    // when the page has it: its wording, links and styling are the merchant's
    // work, and a fresh default in its place would quietly throw that away.
    if (!keep && mode === 'replace' && section.added) {
      const own = existing.find(
        (row) => row.type === section.type && !used.has(row.id)
      )
      if (own) {
        used.add(own.id)
        rows.push({
          id: own.id,
          type: own.type,
          content: own.content as object,
          config: (own.config ?? {}) as object,
          isVisible: own.isVisible,
        })
        continue
      }
    }
    rows.push({
      id: keep?.id ?? `temp-${randomUUID()}`,
      type: section.type,
      content: section.content,
      config: keep
        ? restyle(keep.config, section.config, styles.get(`id:${keep.id}`))
        : section.config,
      isVisible: section.isVisible,
    })
  }
  return rows.map((row, order) => ({ ...row, order }))
}

function summarize(issues: DesignIssue[]) {
  return {
    leftOut: issues.filter((issue) => issue.level === 'error').length,
    fixed: issues.filter((issue) => issue.level === 'warning').length,
    notes: issues,
  }
}

// ── Tools ────────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_design_guide',
    title: 'Read the NCOM design guide',
    description:
      'Start here. Returns the full instructions for designing on NCOM: the design JSON format, the rules for Bangladeshi cash-on-delivery landing pages and online stores, the fonts, and every block with its fields. Call it before writing a design.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          ...KIND,
          description:
            'LANDING for a one-page landing page, STORE for an online store.',
        },
        scope: {
          type: 'string',
          enum: ['site', 'page'],
          description: 'Design a whole new site, or one page. Default site.',
        },
        pageRole: {
          ...ROLE,
          description:
            'For scope "page": which kind of page. Default STANDARD.',
        },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args) {
      const kind = kindArg(args)
      const scope = args.scope === 'page' ? 'page' : 'site'
      const role = (
        typeof args.pageRole === 'string' ? args.pageRole : 'STANDARD'
      ) as PageRole
      return designGuide({ kind, scope, role, channel: 'mcp' })
    },
  },
  {
    name: 'list_block_types',
    title: 'List blocks',
    description:
      'The blocks a site of this kind can use (optionally on one kind of page), each with its fields, limits and defaults, as compact text.',
    inputSchema: {
      type: 'object',
      properties: { kind: KIND, pageRole: ROLE },
      required: ['kind'],
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args) {
      const kind = kindArg(args)
      const role =
        typeof args.pageRole === 'string'
          ? (args.pageRole as PageRole)
          : undefined
      return {
        blocks: blocksFor(kind, role).map((block) => ({
          type: block.type,
          name: block.name,
          description: block.description,
        })),
        details: catalogText(kind, role),
      }
    },
  },
  {
    name: 'get_block_type',
    title: 'Describe one block',
    description:
      'One block in full: where it can go, the JSON Schema of its content, and its default content in English and Bangla.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'A block type, e.g. "hero".' },
      },
      required: ['type'],
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args) {
      const raw = string(args, 'type')!
      const type = resolveBlockType(raw)
      const doc = type ? findBlockDoc(type) : undefined
      const definition = type ? getSectionDefinition(type) : undefined
      if (!doc || !definition)
        throw new ToolError(
          `There is no block called "${raw}". Call list_block_types.`
        )
      return {
        ...doc,
        contentSchema: contentJsonSchema(definition),
        defaults: {
          en: localizedDefaults(definition, 'en'),
          bn: localizedDefaults(definition, 'bn'),
        },
      }
    },
  },
  {
    name: 'list_sites',
    title: 'List websites',
    description:
      'Every website in this workspace — landing pages and online stores — with their pages, language, live address and builder links.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(_args, context) {
      const stores = await listStores(context.organizationId)
      const pages = await prisma.page.findMany({
        where: { storeId: { in: stores.map((store) => store.id) } },
        select: {
          id: true,
          storeId: true,
          title: true,
          slug: true,
          role: true,
          isHome: true,
          status: true,
          previewToken: true,
        },
        orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }],
      })
      const themes = await prisma.themeSettings.findMany({
        where: { storeId: { in: stores.map((store) => store.id) } },
        select: { storeId: true, language: true },
      })
      return {
        sites: stores.map((store) => {
          const sitePages = pages.filter((page) => page.storeId === store.id)
          // The header and footer are reviewed on the home page (see reviewLinks).
          const home =
            sitePages.find((page) => page.isHome) ??
            sitePages.find((page) => page.role === 'STANDARD')
          return {
            id: store.id,
            name: store.name,
            kind: store.kind,
            language: siteLanguage(
              themes.find((theme) => theme.storeId === store.id)
            ),
            liveUrl: liveUrl(store.subdomain),
            pages: sitePages.map((page) => ({
              id: page.id,
              title: page.title,
              slug: page.slug,
              role: page.role,
              isHome: page.isHome,
              status: page.status,
              ...(page.role !== 'LAYOUT'
                ? pageLinks(store.id, page)
                : home && pageLinks(store.id, home)),
            })),
          }
        }),
      }
    },
  },
  {
    name: 'get_page',
    title: 'Read a page',
    description:
      'A page as it is now (the draft the builder shows), in the NCOM design format with each section\'s "id". To change it, edit this and pass it to update_page — keep the ids of sections you keep.',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string' } },
      required: ['pageId'],
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, context) {
      const page = await requirePage(
        context.organizationId,
        string(args, 'pageId')!
      )
      return {
        site: {
          id: page.store.id,
          name: page.store.name,
          kind: page.store.kind,
          language: siteLanguage(page.store.theme),
        },
        page: {
          id: page.id,
          title: page.title,
          role: page.role,
          isHome: page.isHome,
          status: page.status,
        },
        design: exportPage({
          title: page.title,
          sections: page.sections.map((section) => ({
            ...section,
            config: section.config as SectionConfig,
          })),
        }),
        ...(await reviewLinks(page.store.id, page)),
      }
    },
  },
  {
    name: 'get_site',
    title: 'Read a site',
    description:
      "A site's draft theme (colours, fonts, language), its pages, and — for an online store — its shared layout (announcement bar, header, footer) in the design format.",
    inputSchema: {
      type: 'object',
      properties: { siteId: { type: 'string' } },
      required: ['siteId'],
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, context) {
      const store = await requireSite(
        context.organizationId,
        string(args, 'siteId')!
      )
      const pages = await prisma.page.findMany({
        where: { storeId: store.id },
        include: { sections: { orderBy: { order: 'asc' } } },
        orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }],
      })
      const layout = pages.find((page) => page.role === 'LAYOUT')
      const theme = store.theme
      return {
        id: store.id,
        name: store.name,
        kind: store.kind,
        liveUrl: liveUrl(store.subdomain),
        theme: theme && {
          primaryColor: theme.primaryColor,
          secondaryColor: theme.secondaryColor,
          backgroundColor: theme.backgroundColor,
          textColor: theme.textColor,
          headingFont: theme.headingFont,
          bodyFont: theme.bodyFont,
          buttonStyle: theme.buttonStyle,
          borderRadius: theme.borderRadius,
          headingWeight: theme.headingWeight,
          containerWidth: theme.containerWidth,
          language: theme.language,
          numerals: theme.numerals,
        },
        layout: layout
          ? {
              pageId: layout.id,
              sections: layout.sections.map((section) =>
                exportSection({
                  ...section,
                  config: section.config as SectionConfig,
                })
              ),
            }
          : null,
        pages: pages
          .filter((page) => page.role !== 'LAYOUT')
          .map((page) => ({
            id: page.id,
            title: page.title,
            slug: page.slug,
            role: page.role,
            isHome: page.isHome,
            status: page.status,
            sections: page.sections.length,
            ...pageLinks(store.id, page),
          })),
      }
    },
  },
  {
    name: 'list_catalog',
    title: 'List categories and products',
    description:
      "The workspace's categories (ids and handles for `category` fields and /categories/<handle> links), collections, and its newest products (ids for `products` fields). Product blocks show products automatically — use this to point them at the right category.",
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    write: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(_args, context) {
      const [catalogue, products] = await Promise.all([
        loadStoreCatalogue(context.organizationId),
        runProductQuery(context.organizationId, {
          source: 'newest',
          limit: 48,
        }).catch(() => []),
      ])
      return {
        currencyCode: catalogue.currencyCode,
        categories: catalogue.categories.map((category) => ({
          id: category.id,
          name: category.name,
          handle: category.handle,
          parentId: category.parentId,
        })),
        collections: catalogue.collections.map((collection) => ({
          id: collection.id,
          title: collection.title,
          handle: collection.handle,
        })),
        products: products.map((product) => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          priceCents: product.priceCents,
        })),
      }
    },
  },
  {
    name: 'create_site',
    title: 'Create a website',
    description:
      'Creates a new landing page or online store in this workspace from a design (see get_design_guide, scope "site"), or from a ready-made template. Plan limits apply. The site is created unpublished; return the builderUrl to the owner so they can review it and press Publish.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: KIND,
        name: { type: 'string', description: 'The site or shop name.' },
        subdomain: {
          type: 'string',
          description:
            'Optional address, lowercase letters, digits and dashes.',
        },
        language: {
          type: 'string',
          enum: ['en', 'bn'],
          description:
            'What shoppers read. Default: the design\'s "language", else en.',
        },
        design: DESIGN,
        template: {
          type: 'string',
          enum: SITE_TEMPLATES.map((template) => template.key),
          description: `A ready-made template instead of a design. Landing pages: ${templateList('LANDING')}. Online stores: ${templateList('STORE')}.`,
        },
      },
      required: ['kind', 'name'],
      additionalProperties: false,
    },
    write: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, context) {
      const kind = kindArg(args)
      const issues: DesignIssue[] = []
      const design =
        args.design !== undefined ? prepareDesign(args.design) : undefined
      // The guide asks a site design to say which language it is written in.
      // Building a Bangla design as an English site would fill everything it
      // left out — the order form, the shop's own words, the digits — in English.
      const language: SiteLanguage = isSiteLanguage(args.language)
        ? args.language
        : (design?.language ?? 'en')
      if (design?.language && design.language !== language) {
        issues.push({
          level: 'info',
          where: 'Site',
          message: `The design says it is in ${LANGUAGE_NAME[design.language]}; the site was made in ${LANGUAGE_NAME[language]}, as the "language" argument asked.`,
        })
      }
      const templateKey = string(args, 'template', false)
      if (templateKey && design) {
        issues.push({
          level: 'warning',
          where: 'Site',
          message: `The site was made from the design, so the template "${templateKey}" was not used. Send a design or a template, not both.`,
        })
      } else if (templateKey) {
        // createStore falls back to a blank site for a key it does not know,
        // which would leave the model telling the owner it used a template.
        const template = getTemplate(templateKey)
        if (!template || template.kind !== kind) {
          const what = template
            ? `"${templateKey}" is ${template.kind === 'STORE' ? 'an online store' : 'a landing page'} template.`
            : `There is no ${kind === 'STORE' ? 'online store' : 'landing page'} template called "${templateKey}".`
          throw new ToolError(
            `${what} For ${kind === 'STORE' ? 'an online store' : 'a landing page'}, use one of: ${templatesFor(
              kind
            )
              .map((option) => `"${option.key}"`)
              .join(', ')}.`
          )
        }
      }
      const parsed = createStoreSchema.safeParse({
        name: args.name,
        subdomain:
          typeof args.subdomain === 'string' && args.subdomain
            ? args.subdomain
            : undefined,
        currencyCode: 'BDT',
        kind,
        templateKey: design ? undefined : templateKey,
        language,
      })
      if (!parsed.success) {
        throw new ToolError(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')
        )
      }
      let template
      if (design) {
        const read = readSiteDesign(design.value, {
          kind,
          language,
          source: 'mcp',
        })
        if (!read.ok) throw new ToolError(read.message)
        issues.push(...read.issues)
        template = read.template
      }
      const store = await createStore(
        context.organizationId,
        parsed.data,
        template
      )
      const pages = await prisma.page.findMany({
        where: { storeId: store.id },
        select: {
          id: true,
          title: true,
          role: true,
          isHome: true,
          previewToken: true,
        },
        orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }],
      })
      const home =
        pages.find((page) => page.isHome) ??
        pages.find((page) => page.role === 'STANDARD')
      return {
        site: {
          id: store.id,
          name: store.name,
          kind: store.kind,
          liveUrl: liveUrl(store.subdomain),
        },
        pages: pages.map((page) => ({
          id: page.id,
          title: page.title,
          role: page.role,
          isHome: page.isHome,
        })),
        ...(home && pageLinks(store.id, home)),
        design: summarize(issues),
        next: 'The site is a draft. Ask the owner to open builderUrl, check it, and press Publish.',
      }
    },
  },
  {
    name: 'update_page',
    title: 'Change a page',
    description:
      'Saves a new design for a page as a draft. mode "replace" (default) makes the page exactly the design — sections whose "id" you kept from get_page are updated in place, others are added, and sections you left out are removed. A kept section\'s "style" is its whole section style: a style you leave out, or set to null, is removed. mode "append" adds the design\'s sections after the existing ones (a one-per-page block the page already has is left out). The "seo" title and description are saved too. For an online store, a header, footer or announcement in the design updates the shared layout; a design holding only those leaves the page\'s own sections as they are.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        design: DESIGN,
        mode: { type: 'string', enum: ['replace', 'append'] },
      },
      required: ['pageId', 'design'],
      additionalProperties: false,
    },
    write: true,
    // Not idempotent: every "append" adds the sections again.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, context) {
      const page = await requirePage(
        context.organizationId,
        string(args, 'pageId')!
      )
      const mode = args.mode === 'append' ? 'append' : 'replace'
      const language = siteLanguage(page.store.theme)
      const design = prepareDesign(args.design)
      const read = readPageDesign(design.value, {
        kind: page.store.kind,
        role: page.role,
        language,
        partial: mode === 'append',
      })
      if (!read.ok) throw new ToolError(read.message)
      if (mode === 'append') {
        // The page keeps its own order form and other one-per-page blocks —
        // said in the notes, or the model reports a block added that never was.
        read.sections = read.sections.filter((section) => {
          const definition = getSectionDefinition(section.type)
          if (!definition?.singleton) return true
          if (!page.sections.some((existing) => existing.type === section.type))
            return true
          read.issues.push({
            level: 'warning',
            where: 'Page',
            message: `A page has only one ${definition.name.toLowerCase()} block and this page already has it, so the design's was left out. Change the one it has with update_section.`,
          })
          return false
        })
      }

      const layoutChange =
        read.layout.length > 0 &&
        page.store.kind === 'STORE' &&
        page.role !== 'LAYOUT'
      // What the design put on the page itself. A replace starts the page over,
      // so it needs some of the design's own blocks to start it from: the order
      // form a landing page gets back, or a product page's details, are the
      // page's rules, not the design. Without this a design that was only about
      // the store's header would empty the page it was sent with.
      const own =
        mode === 'append'
          ? read.sections
          : read.sections.filter((section) => design.types.has(section.type))
      if (own.length === 0 && !layoutChange) {
        const reasons = read.issues
          .filter((issue) => issue.level !== 'info')
          .map((issue) => issue.message)
        throw new ToolError(
          [
            mode === 'append'
              ? 'Nothing in that design could be added to this page, so it was left as it was.'
              : 'Nothing in that design could go on this page itself, so it was left as it was.',
            ...reasons,
          ].join(' ')
        )
      }
      if (own.length > 0) {
        await savePageSections(
          context.organizationId,
          page.store.id,
          page.id,
          sectionRows(read.sections, page.sections, mode, design.styles)
        )
      } else {
        // The reader's "Added the … block" notes describe a page that was not
        // saved; left in, they read as if the page had changed.
        read.issues = read.issues.filter(
          (issue) =>
            !(
              issue.level === 'info' &&
              issue.where === 'Page' &&
              issue.message.startsWith('Added')
            )
        )
        read.issues.push({
          level: 'info',
          where: 'Page',
          message:
            "The page's own sections were left as they were — nothing in the design was for the page itself. Its header, footer or announcement bar went to the store's shared layout, which update_layout changes on its own.",
        })
      }
      if (layoutChange) {
        await mergeLayout(
          context.organizationId,
          page.store.id,
          read.layout,
          design.styles
        )
      }
      // After a save above, which is what checked the caller may change this store.
      await saveSeo(page, read.seo, read.issues)
      return {
        ...(await reviewLinks(page.store.id, page)),
        design: summarize(read.issues),
        next: 'Saved as a draft. The owner publishes it from the builder.',
      }
    },
  },
  {
    name: 'update_section',
    title: 'Change one section',
    description:
      'Changes one section of a page: the content fields you pass are merged over what is there (others are kept), and the style fields likewise — set a style field to null to remove it, so the section follows the theme again. Use get_page for section ids.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        sectionId: { type: 'string' },
        content: { type: 'object', additionalProperties: true },
        style: { type: 'object', additionalProperties: true },
        hidden: { type: 'boolean' },
      },
      required: ['pageId', 'sectionId'],
      additionalProperties: false,
    },
    write: true,
    // Overwrites what the section had (and can hide it), with no history to undo from.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, context) {
      const page = await requirePage(
        context.organizationId,
        string(args, 'pageId')!
      )
      const sectionId = string(args, 'sectionId')!
      const existing = page.sections.find((section) => section.id === sectionId)
      if (!existing)
        throw new ToolError(
          `No section "${sectionId}" on this page. Call get_page.`
        )
      const issues: DesignIssue[] = []
      const current = exportSection({
        ...existing,
        config: existing.config as SectionConfig,
      })
      const patch = isObject(args.style) ? args.style : {}
      // The section's styles with the ones passed laid over them; one passed as
      // null or "" is taken out, and restyle below then removes it.
      const style: Record<string, unknown> = {
        ...(current.style ?? {}),
        ...patch,
      }
      for (const [key, value] of Object.entries(patch)) {
        if (clearsStyle(key, value)) delete style[key]
      }
      // Taking the background off means its colour too: a colour left behind
      // makes the reader turn the custom background straight back on.
      if (
        clearsStyle('backgroundVariant', patch.backgroundVariant) &&
        !(
          typeof patch.backgroundColor === 'string' &&
          patch.backgroundColor.trim()
        )
      ) {
        delete style.backgroundColor
      }
      const merged = normalizeSection(
        {
          type: existing.type,
          content: {
            ...(existing.content as object),
            ...(isObject(args.content) ? args.content : {}),
          },
          style,
          hidden:
            typeof args.hidden === 'boolean'
              ? args.hidden
              : !existing.isVisible,
        },
        0,
        {
          kind: page.store.kind,
          role: page.role,
          language: siteLanguage(page.store.theme),
        },
        issues
      )
      if (!merged)
        throw new ToolError(
          issues[0]?.message ?? 'That change could not be used.'
        )
      await savePageSections(
        context.organizationId,
        page.store.id,
        page.id,
        page.sections.map((section) =>
          section.id === sectionId
            ? {
                id: section.id,
                type: section.type,
                order: section.order,
                content: merged.content,
                config: restyle(
                  section.config,
                  merged.config,
                  new Set(Object.keys(style))
                ),
                isVisible: merged.isVisible,
              }
            : {
                id: section.id,
                type: section.type,
                order: section.order,
                content: section.content as object,
                config: (section.config ?? {}) as object,
                isVisible: section.isVisible,
              }
        )
      )
      return {
        ...(await reviewLinks(page.store.id, page)),
        design: summarize(issues),
      }
    },
  },
  {
    name: 'create_page',
    title: 'Add a page to an online store',
    description:
      'Adds a page (About us, Contact, an offer page…) to an online store, from a design (scope "page"), with its "seo" title and description. The header, footer and announcement bar are shared by every page — change them with update_layout, not here. Landing page sites have exactly one page — use update_page for those. Plan limits apply.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        title: { type: 'string' },
        slug: {
          type: 'string',
          description: 'Optional address, e.g. "about".',
        },
        design: DESIGN,
      },
      required: ['siteId', 'title'],
      additionalProperties: false,
    },
    write: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, context) {
      const store = await requireSite(
        context.organizationId,
        string(args, 'siteId')!
      )
      const language = siteLanguage(store.theme)
      let issues: DesignIssue[] = []
      let seo: PageDesignResult['seo'] = null
      let sections: {
        type: string
        content: Record<string, unknown>
        config: SectionConfig
      }[] = []
      if (args.design !== undefined) {
        const design = prepareDesign(args.design)
        const read = readPageDesign(design.value, {
          kind: store.kind,
          role: 'STANDARD',
          language,
        })
        if (!read.ok) throw new ToolError(read.message)
        if (
          read.sections.every((section) => section.added) &&
          read.layout.length > 0
        ) {
          throw new ToolError(
            'That design holds only the header, footer or announcement bar, so no page was made. Those are shared by every page — change them with update_layout — and a new page needs its own sections.'
          )
        }
        issues = read.issues
        seo = read.seo
        if (read.layout.length > 0) {
          // update_page applies these to the layout, but adding a page should
          // not quietly change every other page's header; say where they go.
          const names = read.layout.map(
            (section) =>
              getSectionDefinition(section.type)?.name.toLowerCase() ??
              section.type
          )
          issues.push({
            level: 'warning',
            where: 'Layout',
            message: `Left out the ${names.join(' and ')} — every page of the store shares one header, footer and announcement bar. Change them with update_layout.`,
          })
        }
        sections = read.sections.map((section) => ({
          type: section.type,
          content: section.content,
          config: section.isVisible
            ? section.config
            : { ...section.config, hideOnMobile: true, hideOnDesktop: true },
        }))
      }
      const input = createPageSchema.safeParse({
        title: args.title,
        slug: string(args, 'slug', false),
      })
      if (!input.success) {
        throw new ToolError(
          input.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')
        )
      }
      const page = await createPage(
        context.organizationId,
        store.id,
        input.data,
        sections
      )
      await saveSeo(page, seo, issues)
      return {
        page: { id: page.id, title: page.title, slug: page.slug },
        ...pageLinks(store.id, page),
        design: summarize(issues),
      }
    },
  },
  {
    name: 'update_layout',
    title: "Change an online store's header and footer",
    description:
      'Replaces an online store\'s shared layout — the announcement bar (optional), header and footer shown on every page — with the design\'s sections. Sections that keep an "id" from get_site are updated in place, and a kept section\'s "style" is its whole section style, as in update_page. The builderUrl it returns is the home page\'s: the builder shows the header and footer around it.',
    inputSchema: {
      type: 'object',
      properties: { siteId: { type: 'string' }, design: DESIGN },
      required: ['siteId', 'design'],
      additionalProperties: false,
    },
    write: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, context) {
      const store = await requireSite(
        context.organizationId,
        string(args, 'siteId')!
      )
      if (store.kind !== 'STORE')
        throw new ToolError(
          'Only online stores have a shared header and footer.'
        )
      const layout = await prisma.page.findFirst({
        where: { storeId: store.id, role: 'LAYOUT' },
        include: { sections: { orderBy: { order: 'asc' } } },
      })
      if (!layout) throw new ToolError('This store has no layout page.')
      const design = prepareDesign(args.design)
      const read = readPageDesign(design.value, {
        kind: 'STORE',
        role: 'LAYOUT',
        language: siteLanguage(store.theme),
      })
      if (!read.ok) throw new ToolError(read.message)
      // The layout always gets a header and a footer, so a design whose own
      // blocks could all not be used still "reads" — as two default blocks
      // that would replace the store's own header and footer. Same rule as
      // update_page: a replace needs something of the design's to start from.
      if (!read.sections.some((section) => design.types.has(section.type))) {
        const reasons = read.issues
          .filter((issue) => issue.level !== 'info')
          .map((issue) => issue.message)
        throw new ToolError(
          [
            'Nothing in that design could go in the header and footer area, so the layout was left as it was.',
            ...reasons,
          ].join(' ')
        )
      }
      await savePageSections(
        context.organizationId,
        store.id,
        layout.id,
        sectionRows(read.sections, layout.sections, 'replace', design.styles)
      )
      return {
        // The layout has no builder page of its own; it is reviewed on the home page.
        ...(await reviewLinks(store.id, layout)),
        design: summarize(read.issues),
        next: 'Saved as a draft. The owner publishes it from the builder.',
      }
    },
  },
  {
    name: 'update_site_theme',
    title: "Change a site's colours, fonts or language",
    description:
      'Changes a site\'s draft theme: colours (hex), fonts (headingFont, bodyFont: a name from the guide\'s font list or any Google Fonts family by its exact name; "Google Sans" is the default for Bangla sites), buttonStyle, borderRadius, headingWeight, and the language shoppers read (en | bn) with its numerals (latin | bangla — Bangla digits only on a Bangla site; switching to English switches the digits to Latin). Only the fields you pass change.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        theme: { type: 'object', additionalProperties: true },
        language: { type: 'string', enum: ['en', 'bn'] },
        numerals: { type: 'string', enum: ['latin', 'bangla'] },
      },
      required: ['siteId'],
      additionalProperties: false,
    },
    write: true,
    // Overwrites the brand's colours, fonts and language, with no history to undo from.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, context) {
      const store = await requireSite(
        context.organizationId,
        string(args, 'siteId')!
      )
      const issues: DesignIssue[] = []
      const theme = normalizeTheme(args.theme, issues)
      const patch: Record<string, unknown> = { ...theme }
      // A design's theme can carry its language too; normalizeTheme leaves it to us.
      const languageArg =
        args.language ??
        (isObject(args.theme) ? args.theme.language : undefined)
      if (isSiteLanguage(languageArg)) patch.language = languageArg
      else if (languageArg !== undefined) {
        issues.push({
          level: 'warning',
          where: 'Theme',
          message: 'Ignored "language": use "en" or "bn".',
        })
      }
      if (args.numerals === 'latin' || args.numerals === 'bangla')
        patch.numerals = args.numerals

      // The theme form's rule: Bangla digits beside English words read as a
      // mistake, so an English site writes Latin digits. A switch to English
      // takes the digits with it, rather than leaving "৳১,২৫০" beside
      // "Add to cart".
      const language = isSiteLanguage(patch.language)
        ? patch.language
        : siteLanguage(store.theme)
      if (language === 'en' && ('language' in patch || 'numerals' in patch)) {
        if (patch.numerals === 'bangla') {
          const message =
            'Bangla digits are only for Bangla sites, so this English site keeps Latin digits (1,250). Set "language" to "bn" as well to use Bangla digits.'
          // Every other note too: a font refused beside the digits is as much
          // the answer as the digits rule.
          if (Object.keys(patch).length === 1) {
            throw new ToolError(
              [
                'Nothing was changed.',
                message,
                ...issues.map((issue) => issue.message),
              ].join(' ')
            )
          }
          issues.push({ level: 'warning', where: 'Theme', message })
        }
        patch.numerals = 'latin'
      }

      if (Object.keys(patch).length === 0) {
        // A font that is not on Google Fonts, or a colour that is not hex, is
        // left out with a note; when that was the only field, the note is the
        // whole answer — "Nothing to change" alone reads as if nothing was sent.
        throw new ToolError(
          issues.length > 0
            ? [
                'Nothing was changed.',
                ...issues.map((issue) => issue.message),
              ].join(' ')
            : 'Nothing to change. Pass "theme" fields, "language" or "numerals".'
        )
      }
      await updateDraftTheme(context.organizationId, store.id, patch)
      return {
        changed: Object.keys(patch),
        design: summarize(issues),
        next: 'Saved as a draft. It goes live when the owner publishes.',
      }
    },
  },
]

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Layout blocks a page design included, merged into the store's layout. The
 * layout keeps one of each, so a block replaces the one of its type: its
 * content and its section style (see restyle), keeping per-element styling.
 */
async function mergeLayout(
  organizationId: string,
  storeId: string,
  incoming: NormalizedSection[],
  styles: Map<string, Set<string>>
) {
  const layout = await prisma.page.findFirst({
    where: { storeId, role: 'LAYOUT' },
    include: { sections: { orderBy: { order: 'asc' } } },
  })
  if (!layout) return
  const rows: Omit<SectionSaveInput, 'order'>[] = layout.sections.map(
    (section) => {
      const replacement = incoming.find(
        (candidate) => candidate.type === section.type
      )
      return {
        id: section.id,
        type: section.type,
        content: (replacement?.content ?? section.content) as object,
        config: replacement
          ? restyle(
              section.config,
              replacement.config,
              styles.get(`type:${section.type}`)
            )
          : ((section.config ?? {}) as object),
        isVisible: replacement?.isVisible ?? section.isVisible,
      }
    }
  )
  for (const section of incoming) {
    if (rows.some((row) => row.type === section.type)) continue
    const row = {
      id: `temp-${randomUUID()}`,
      type: section.type,
      content: section.content,
      config: section.config,
      isVisible: section.isVisible,
    }
    // An announcement goes first; anything else at the end.
    if (section.type === 'announcement') rows.unshift(row)
    else rows.push(row)
  }
  await savePageSections(
    organizationId,
    storeId,
    layout.id,
    rows.map((row, order) => ({ ...row, order }))
  )
}
