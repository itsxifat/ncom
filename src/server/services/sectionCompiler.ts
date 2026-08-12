import 'server-only'
import { prisma } from '@/server/db/client'
import { renderLiquidSection } from '@/lib/liquid/renderSection'
import { scopeCss } from '@/modules/sections/custom-code'
import {
  buildCatalogScope,
  buildShopDrop,
  loadStoreSnippets,
} from './storefrontService'
import { buildOfferScope, EMPTY_OFFER_SCOPE } from './offerDrops'

/**
 * Compiles a page's Liquid sections to HTML.
 *
 * Liquid never runs in the React renderer — PageRenderer only ever prints a
 * finished string — so every path that shows a page has to compile it first.
 * That used to live inline in the publish pipeline only, which meant the draft
 * preview routes handed PageRenderer sections with no `html`; those sections
 * found no React definition for their key and rendered as nothing at all. A
 * merchant previewing a page built from a template saw the order form and none
 * of the commerce sections around it.
 *
 * Now every caller shares this, so preview and published output cannot drift.
 *
 * `includeErrors` is the one deliberate difference between them: a preview
 * shows the author their broken template and its line number, while a live
 * storefront renders the section as nothing rather than exposing an error to
 * a shopper.
 */

export interface CompilableSection {
  id: string
  order: number
  content: unknown
  config: unknown
  isVisible: boolean
  componentDefinition: {
    key: string
    renderMode?: string
    liquidSource?: string | null
  }
}

export interface CompiledSection {
  id: string
  order: number
  content: unknown
  config: unknown
  isVisible: boolean
  componentDefinition: { key: string }
  html?: string | null
}

export async function compilePageSections(
  storeId: string,
  sections: CompilableSection[],
  options: {
    includeErrors?: boolean
    publishedSnippets?: boolean
    /** The page being compiled, so its offers reach the Liquid scope. */
    pageId?: string
  } = {}
): Promise<CompiledSection[]> {
  const needsLiquid = sections.some(
    (section) =>
      section.componentDefinition.renderMode === 'LIQUID' ||
      section.componentDefinition.key === 'custom-code'
  )

  // Most pages are built entirely from React sections; skip the catalogue and
  // snippet queries when nothing on the page can use them.
  if (!needsLiquid) {
    return sections.map(toBase)
  }

  // The catalogue is organisation-scoped, not store-scoped — one inventory
  // serves every storefront. Passing a storeId here silently matched nothing
  // and every commerce section rendered with an empty `products`, which looks
  // exactly like a broken template.
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { organizationId: true },
  })
  if (!store) throw new Error('Store not found')

  const [shop, snippets, catalog, offers] = await Promise.all([
    buildShopDrop(storeId),
    loadStoreSnippets(storeId, {
      published: options.publishedSnippets ?? false,
    }),
    buildCatalogScope(store.organizationId),
    options.pageId
      ? buildOfferScope(options.pageId, store.organizationId)
      : Promise.resolve(EMPTY_OFFER_SCOPE),
  ])

  return Promise.all(
    sections.map(async (section) => {
      const base = toBase(section)
      const content = (section.content ?? {}) as Record<string, unknown>
      const isCustomCode = section.componentDefinition.key === 'custom-code'

      const source = isCustomCode
        ? typeof content.html === 'string'
          ? content.html
          : ''
        : section.componentDefinition.liquidSource

      if (
        !source ||
        (!isCustomCode && section.componentDefinition.renderMode !== 'LIQUID')
      ) {
        return base
      }

      const { html, error } = await renderLiquidSection({
        sectionId: section.id,
        source,
        // The catalogue and the page's offers travel with the scope so a
        // section renders real products at real prices rather than only the
        // literal text the author typed.
        scope: { shop, ...catalog, ...offers },
        content,
        snippets,
      })

      if (error) {
        console.error(
          `Liquid compile failed for section ${section.id}: ${error.message}`
        )
        if (!options.includeErrors) return { ...base, html: '' }
        return {
          ...base,
          html:
            `<div style="padding:1rem;border:1px dashed #dc2626;color:#dc2626;` +
            `font:13px ui-monospace,monospace;white-space:pre-wrap">` +
            `Liquid error${error.line ? ` (line ${error.line})` : ''}: ` +
            `${escapeHtml(error.message)}</div>`,
        }
      }

      // custom-code carries its own stylesheet alongside the markup, scoped to
      // this section so one block's CSS cannot restyle the whole page.
      if (isCustomCode) {
        const css = typeof content.css === 'string' ? content.css : ''
        const scoped =
          content.globalCss === true
            ? css
            : scopeCss(css, `[data-section-id="${section.id}"]`)
        return {
          ...base,
          html: scoped ? `<style>${scoped}</style>${html}` : html,
        }
      }

      return { ...base, html }
    })
  )
}

function toBase(section: CompilableSection): CompiledSection {
  return {
    id: section.id,
    order: section.order,
    content: section.content,
    config: section.config,
    isVisible: section.isVisible,
    componentDefinition: { key: section.componentDefinition.key },
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
