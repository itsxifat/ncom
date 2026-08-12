'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db/client'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { renderLiquidSection } from '@/lib/liquid/renderSection'
import { buildTemplatePreviewScope } from '@/server/services/templatePreviewScope'
import { scopeCss } from '@/modules/sections/custom-code'
import {
  saveTemplateSections,
  type TemplateSectionSaveInput,
} from '@/server/services/templateService'

export async function saveTemplateSectionsAction(
  templateId: string,
  sections: TemplateSectionSaveInput[]
): Promise<{ idMapping: Record<string, string> }> {
  const idMapping = await saveTemplateSections(templateId, sections)
  revalidatePath(`/templates/${templateId}/preview`)
  return { idMapping }
}

export type SectionPreview =
  { ok: true; html: string } | { ok: false; error: string }

/**
 * Compiles one of a template's Liquid sections for the builder canvas.
 *
 * Without this the template builder had no way to run Liquid at all, so every
 * commerce section in a template — the bundle offer, the product hero, the
 * sticky bar — rendered as an empty div and the template looked like it had
 * lost half its layers. The page builder has had this bridge since custom
 * sections shipped; templates simply never got one.
 *
 * The scope is sample data rather than a store's, because a template has no
 * store behind it. See templatePreviewScope for why that is the right trade.
 */
export async function renderTemplateSectionPreviewAction(
  templateId: string,
  input: {
    sectionId: string
    componentDefinitionId: string
    content: Record<string, unknown>
  }
): Promise<SectionPreview> {
  try {
    await requirePlatformAdmin()

    const template = await prisma.template.findUnique({
      where: { id: templateId },
      select: { id: true },
    })
    if (!template) return { ok: false, error: 'Template not found' }

    const definition = await prisma.componentDefinition.findFirst({
      where: { id: input.componentDefinitionId, isActive: true },
      select: { key: true, renderMode: true, liquidSource: true },
    })
    if (!definition) return { ok: false, error: 'Section not found' }

    const isCustomCode = definition.key === 'custom-code'
    const source = isCustomCode
      ? typeof input.content.html === 'string'
        ? input.content.html
        : ''
      : definition.liquidSource

    if (!source || (!isCustomCode && definition.renderMode !== 'LIQUID')) {
      return { ok: false, error: 'This section does not use Liquid' }
    }

    const { html, error } = await renderLiquidSection({
      sectionId: input.sectionId,
      source,
      content: input.content,
      scope: buildTemplatePreviewScope(),
      // Snippets are store-scoped; a template cannot reference one and stay
      // portable to the merchant who installs it.
      snippets: {},
    })

    if (error) {
      return {
        ok: false,
        error: error.line
          ? `Line ${error.line}: ${error.message}`
          : error.message,
      }
    }

    if (!isCustomCode) return { ok: true, html }

    const css = typeof input.content.css === 'string' ? input.content.css : ''
    const scoped =
      input.content.globalCss === true
        ? css
        : scopeCss(css, `[data-section-id="${input.sectionId}"]`)

    return {
      ok: true,
      html: scoped ? `<style>${scoped}</style>${html}` : html,
    }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not render',
    }
  }
}
