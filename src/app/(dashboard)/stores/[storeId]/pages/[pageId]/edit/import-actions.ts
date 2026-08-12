'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db/client'
import { getActiveOrganization } from '@/server/services/organizationService'
import { requireOrgAccess } from '@/server/auth/rbac'
import { parseAndValidateLiquidDocument } from '@/lib/liquid/document'
import { slugify } from '@/lib/slug'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Imports a pasted Liquid document onto a page as editable layers.
 *
 * The merchant-facing half of the same idea as the admin template import: one
 * paste becomes N sections in the builder, each with its own generated
 * settings form, each reorderable and editable afterwards. Pasting code is a
 * *starting point* for hand-editing, not an alternative to it.
 *
 * Definitions are scoped to the organisation that imported them, so one
 * store's imported sections never appear in another's palette.
 */
export type ImportState = { error?: string; success?: string } | undefined

export async function importLiquidToPageAction(
  storeId: string,
  pageId: string,
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const source = String(formData.get('source') ?? '')
  const replace = formData.get('replace') === 'on'

  if (!source.trim()) return { error: 'Paste some Liquid to import' }

  try {
    const { organization } = await getActiveOrganization()
    await requireOrgAccess(organization.id, 'EDITOR')

    const page = await prisma.page.findFirst({
      where: {
        id: pageId,
        storeId,
        store: { organizationId: organization.id },
      },
      select: { id: true },
    })
    if (!page) return { error: 'Page not found' }

    const parsed = await parseAndValidateLiquidDocument(source)
    if (parsed.error) return { error: parsed.error }
    if (parsed.layers.length === 0) {
      return { error: 'No sections found in that document' }
    }

    await prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.pageSection.deleteMany({ where: { pageId } })
      }

      const existing = replace
        ? 0
        : await tx.pageSection.count({ where: { pageId } })

      for (const [index, layer] of parsed.layers.entries()) {
        // Namespaced per organisation and page so two imports never collide,
        // and re-importing updates the same definitions in place.
        const key = `imp-${organization.id.slice(-6)}-${pageId.slice(-6)}-${slugify(layer.handle) || index}`

        const definition = await tx.componentDefinition.upsert({
          where: { key },
          create: {
            key,
            name: layer.name,
            category: layer.category,
            renderMode: 'LIQUID',
            ownerOrganizationId: organization.id,
            liquidSource: layer.template,
            schemaJson: {
              schema: layer.schema,
              editorFields: layer.editorFields,
            } as unknown as Prisma.InputJsonValue,
            defaultContent: layer.defaultContent as Prisma.InputJsonValue,
            isActive: true,
            sortOrder: index,
          },
          update: {
            name: layer.name,
            category: layer.category,
            liquidSource: layer.template,
            schemaJson: {
              schema: layer.schema,
              editorFields: layer.editorFields,
            } as unknown as Prisma.InputJsonValue,
            defaultContent: layer.defaultContent as Prisma.InputJsonValue,
          },
          select: { id: true },
        })

        await tx.pageSection.create({
          data: {
            pageId,
            componentDefinitionId: definition.id,
            order: existing + index,
            content: layer.defaultContent as Prisma.InputJsonValue,
            config: {},
            isVisible: true,
          },
        })
      }
    })

    revalidatePath(`/stores/${storeId}/pages/${pageId}/edit`)

    return {
      success: `Imported ${parsed.layers.length} ${
        parsed.layers.length === 1 ? 'layer' : 'layers'
      }. Reload the editor to see them.`,
    }
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Could not import',
    }
  }
}
