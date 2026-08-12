import { renderLiquid, type LiquidRenderError } from './engine'
import { extractSection } from './schema'
import { buildSectionDrop, type StorefrontScope } from './drops'

/**
 * Renders one Liquid section to an HTML string.
 *
 * Kept free of database and React imports so it can run in three places
 * without dragging anything else along: the publish pipeline (compiling into
 * the page snapshot), the builder preview (a server action re-rendering one
 * section as the author types), and the section code editor's preview pane.
 */

export interface RenderSectionInput {
  /** Stable id for the rendered section, used for `section.id` and block ids. */
  sectionId: string
  /** The section's Liquid source, schema block included. */
  source: string
  /** Saved content: setting values plus an optional `blocks` array. */
  content: Record<string, unknown>
  /** Storefront objects (shop, product, cart, …) visible to this render. */
  scope: StorefrontScope
  /** Store-scoped `{% render %}` partials, name -> source. */
  snippets?: Record<string, string>
}

export interface RenderedSection {
  html: string
  error: LiquidRenderError | null
}

export async function renderLiquidSection(
  input: RenderSectionInput
): Promise<RenderedSection> {
  const { template, error: schemaError } = extractSection(input.source)

  // A broken schema does not stop the template rendering — the schema only
  // drives the editor UI, and an author fixing their JSON should still be able
  // to see their markup.
  if (schemaError) {
    const result = await renderTemplate(template, input)
    return {
      html: result.html,
      error: result.error ?? { message: schemaError },
    }
  }

  return renderTemplate(template, input)
}

async function renderTemplate(
  template: string,
  input: RenderSectionInput
): Promise<RenderedSection> {
  const scope: StorefrontScope = {
    ...input.scope,
    section: buildSectionDrop(input.sectionId, input.content),
  }

  const { html, error } = await renderLiquid(template, scope, {
    snippets: input.snippets,
  })

  return { html, error }
}

/**
 * Placeholder markup for a section that failed to render.
 *
 * Shown only in the builder and preview. On a published storefront a failed
 * section renders as nothing at all: a visitor must never see a template error,
 * and an empty gap degrades better than a broken-looking page. The distinction
 * is the caller's to make via `includeDetail`.
 */
export function renderSectionError(
  error: LiquidRenderError,
  includeDetail: boolean
): string {
  if (!includeDetail) return ''

  const location = error.line ? ` (line ${error.line})` : ''
  return (
    `<div style="padding:1rem;border:1px dashed #dc2626;color:#dc2626;` +
    `font:13px ui-monospace,monospace;white-space:pre-wrap">` +
    `Liquid error${escapeHtml(location)}: ${escapeHtml(error.message)}` +
    `</div>`
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
