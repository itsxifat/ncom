'use server'

import { prisma } from '@/server/db/client'
import { getActiveOrganization } from '@/server/services/organizationService'
import { requireOrgAccess } from '@/server/auth/rbac'
import { renderLiquidSection } from '@/lib/liquid/renderSection'
import {
  buildCatalogScope,
  buildShopDrop,
  loadStoreSnippets,
} from '@/server/services/storefrontService'
import { buildOfferScope } from '@/server/services/offerDrops'
import type { StorefrontScope } from '@/lib/liquid/drops'
import { scopeCss } from '@/modules/sections/custom-code'

/**
 * Renders one section's Liquid to HTML for the builder canvas.
 *
 * The canvas is a client component and the Liquid engine is server-side — that
 * gap is why custom sections previously appeared to do nothing once added to a
 * page. This action is the bridge: the canvas posts a section's source and
 * settings, the server compiles it in the sandbox, and the HTML comes back to
 * be painted in place.
 *
 * It renders with `includeDetail`, so a broken template shows the merchant its
 * error and line number here — the opposite of the published storefront, where
 * a failed section renders as nothing rather than exposing an error to
 * shoppers.
 */
export type SectionPreview =
  { ok: true; html: string } | { ok: false; error: string }

export async function renderSectionPreviewAction(
  storeId: string,
  pageId: string,
  input: {
    sectionId: string
    componentDefinitionId: string
    content: Record<string, unknown>
  }
): Promise<SectionPreview> {
  try {
    const { organization } = await getActiveOrganization()
    await requireOrgAccess(organization.id, 'EDITOR')

    const store = await prisma.store.findFirst({
      where: { id: storeId, organizationId: organization.id },
      select: { id: true },
    })
    if (!store) return { ok: false, error: 'Store not found' }

    // Scoping the page to the store as well, so a caller cannot pull another
    // page's offers into this render by swapping the id.
    const page = await prisma.page.findFirst({
      where: { id: pageId, storeId: store.id },
      select: { id: true },
    })
    if (!page) return { ok: false, error: 'Page not found' }

    const definition = await prisma.componentDefinition.findFirst({
      where: {
        id: input.componentDefinitionId,
        isActive: true,
        // Same scoping as the palette: a caller cannot render another
        // organisation's section by guessing its id.
        OR: [
          { ownerOrganizationId: null },
          { ownerOrganizationId: organization.id },
        ],
      },
      select: { key: true, renderMode: true, liquidSource: true },
    })
    if (!definition) return { ok: false, error: 'Section not found' }

    // The built-in custom-code section stores its markup in content rather
    // than on the definition, but still needs Liquid compiled and its CSS
    // scoped exactly like a custom section.
    if (definition.key === 'custom-code') {
      return renderCustomCode(
        store.id,
        page.id,
        organization.id,
        input.sectionId,
        input.content
      )
    }

    if (definition.renderMode !== 'LIQUID' || !definition.liquidSource) {
      return { ok: false, error: 'This section does not use Liquid' }
    }

    const { scope, snippets } = await buildPreviewScope(
      store.id,
      page.id,
      organization.id
    )

    const { html, error } = await renderLiquidSection({
      sectionId: input.sectionId,
      source: definition.liquidSource,
      content: input.content,
      scope,
      snippets,
    })

    if (error) {
      return {
        ok: false,
        error: error.line
          ? `Line ${error.line}: ${error.message}`
          : error.message,
      }
    }

    return { ok: true, html }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not render',
    }
  }
}

/**
 * The objects a section can see while the merchant is editing it.
 *
 * Must match the publish pipeline's scope exactly (see
 * sectionCompiler.compilePageSections), or a section renders one thing in the
 * editor and another once live. Two ways that drifted before:
 *
 *  - the catalogue is organisation-scoped, so passing a storeId to
 *    buildCatalogScope matched no products and every commerce section
 *    previewed with an empty `products`;
 *  - the page's offers were missing entirely, so `{% for offer in offers %}`
 *    always took its `{% else %}` branch and a bundle section rendered its
 *    empty state no matter how many offers the merchant had created.
 */
async function buildPreviewScope(
  storeId: string,
  pageId: string,
  organizationId: string
): Promise<{ scope: StorefrontScope; snippets: Record<string, string> }> {
  const [shop, snippets, catalog, offers] = await Promise.all([
    buildShopDrop(storeId),
    loadStoreSnippets(storeId, { published: false }),
    buildCatalogScope(organizationId),
    buildOfferScope(pageId, organizationId),
  ])

  return { scope: { shop, ...catalog, ...offers }, snippets }
}

async function renderCustomCode(
  storeId: string,
  pageId: string,
  organizationId: string,
  sectionId: string,
  content: Record<string, unknown>
): Promise<SectionPreview> {
  const html = typeof content.html === 'string' ? content.html : ''
  const css = typeof content.css === 'string' ? content.css : ''
  const globalCss = content.globalCss === true

  const { scope, snippets } = await buildPreviewScope(
    storeId,
    pageId,
    organizationId
  )

  const rendered = await renderLiquidSection({
    sectionId,
    source: html,
    content,
    scope,
    snippets,
  })

  if (rendered.error) {
    return {
      ok: false,
      error: rendered.error.line
        ? `Line ${rendered.error.line}: ${rendered.error.message}`
        : rendered.error.message,
    }
  }

  const scoped = globalCss
    ? css
    : scopeCss(css, `[data-section-id="${sectionId}"]`)

  return {
    ok: true,
    html: scoped ? `<style>${scoped}</style>${rendered.html}` : rendered.html,
  }
}
