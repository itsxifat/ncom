import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { validateLiquid } from '@/lib/liquid/engine'
import {
  compileSchemaToFields,
  defaultContentFromSchema,
  extractSection,
} from '@/lib/liquid/schema'
import { slugify } from '@/lib/slug'
import type { Prisma } from '@/generated/prisma/client'
import type { StorefrontTemplateType } from '@/generated/prisma/enums'

/**
 * Theme code: storefront templates, reusable snippets, and custom builder
 * sections.
 *
 * Everything saved here is untrusted tenant source. It is validated for syntax
 * before it can be saved — not for safety, which is the sandbox's job at render
 * time, but so a merchant learns about a typo while editing rather than from a
 * blank storefront. Drafts and published copies are kept separate throughout:
 * saving never changes what visitors see.
 */

export async function listThemeCode(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const [templates, snippets, sections] = await Promise.all([
    prisma.storefrontTemplate.findMany({
      where: { storeId, store: { organizationId } },
      orderBy: { type: 'asc' },
    }),
    prisma.liquidSnippet.findMany({
      where: { storeId, store: { organizationId } },
      orderBy: { name: 'asc' },
    }),
    prisma.componentDefinition.findMany({
      where: { ownerOrganizationId: organizationId, renderMode: 'LIQUID' },
      orderBy: { name: 'asc' },
    }),
  ])

  return { templates, snippets, sections }
}

export async function saveStorefrontTemplate(
  organizationId: string,
  storeId: string,
  templateId: string,
  source: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const template = await prisma.storefrontTemplate.findFirst({
    where: { id: templateId, storeId, store: { organizationId } },
    select: { id: true },
  })
  if (!template) throw new Error('Template not found')

  const error = await validateLiquid(source)
  if (error) {
    throw new Error(
      error.line ? `Line ${error.line}: ${error.message}` : error.message
    )
  }

  return prisma.storefrontTemplate.update({
    where: { id: templateId },
    data: { source },
  })
}

export async function createSnippet(
  organizationId: string,
  storeId: string,
  name: string,
  source = ''
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  // The name becomes the `{% render 'name' %}` key, so it has to be a stable
  // identifier rather than free text.
  const handle = slugify(name)
  if (!handle) throw new Error('Enter a name using letters or numbers')

  const clash = await prisma.liquidSnippet.findFirst({
    where: { storeId, name: handle },
    select: { id: true },
  })
  if (clash) throw new Error(`A snippet called "${handle}" already exists`)

  return prisma.liquidSnippet.create({
    data: { storeId, name: handle, source },
  })
}

export async function saveSnippet(
  organizationId: string,
  storeId: string,
  snippetId: string,
  source: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const snippet = await prisma.liquidSnippet.findFirst({
    where: { id: snippetId, storeId, store: { organizationId } },
    select: { id: true },
  })
  if (!snippet) throw new Error('Snippet not found')

  const error = await validateLiquid(source)
  if (error) {
    throw new Error(
      error.line ? `Line ${error.line}: ${error.message}` : error.message
    )
  }

  return prisma.liquidSnippet.update({
    where: { id: snippetId },
    data: { source },
  })
}

export async function deleteSnippet(
  organizationId: string,
  storeId: string,
  snippetId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const snippet = await prisma.liquidSnippet.findFirst({
    where: { id: snippetId, storeId, store: { organizationId } },
    select: { id: true },
  })
  if (!snippet) throw new Error('Snippet not found')

  await prisma.liquidSnippet.delete({ where: { id: snippetId } })
}

/**
 * Creates or updates a custom builder section.
 *
 * The `{% schema %}` block is parsed here and its compiled FieldConfig[] and
 * defaults are written alongside the source, so the builder's Inspector never
 * has to parse Liquid — it reads the same shape the React sections declare.
 * A schema that fails to parse blocks the save: a section whose editor form
 * cannot be generated is not usable, and saving it would put a broken entry in
 * the palette.
 */
export async function saveCustomSection(
  organizationId: string,
  input: {
    id?: string
    key?: string
    name: string
    category: string
    source: string
  }
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const syntaxError = await validateLiquid(input.source)
  if (syntaxError) {
    throw new Error(
      syntaxError.line
        ? `Line ${syntaxError.line}: ${syntaxError.message}`
        : syntaxError.message
    )
  }

  const { schema, error } = extractSection(input.source)
  if (error) throw new Error(error)
  if (!schema) {
    throw new Error(
      'Add a {% schema %} block so the builder knows what settings to show'
    )
  }

  const editorFields = compileSchemaToFields(schema)
  const defaultContent = defaultContentFromSchema(schema)

  if (input.id) {
    const existing = await prisma.componentDefinition.findFirst({
      where: {
        id: input.id,
        ownerOrganizationId: organizationId,
        renderMode: 'LIQUID',
      },
      select: { id: true },
    })
    if (!existing) throw new Error('Section not found')

    return prisma.componentDefinition.update({
      where: { id: input.id },
      data: {
        name: schema.name || input.name,
        category: schema.category ?? input.category,
        liquidSource: input.source,
        schemaJson: {
          schema,
          editorFields,
        } as unknown as Prisma.InputJsonValue,
        defaultContent: defaultContent as Prisma.InputJsonValue,
      },
    })
  }

  // Keys are globally unique across the platform (built-ins included), so an
  // org-scoped section is namespaced to avoid ever colliding with a registry
  // key like "hero".
  const base = slugify(input.key || schema.name) || 'section'
  const key = `custom-${organizationId.slice(-6)}-${base}`

  const clash = await prisma.componentDefinition.findUnique({
    where: { key },
    select: { id: true },
  })
  if (clash) throw new Error('A section with that name already exists')

  return prisma.componentDefinition.create({
    data: {
      key,
      name: schema.name || input.name,
      category: schema.category ?? input.category,
      renderMode: 'LIQUID',
      ownerOrganizationId: organizationId,
      liquidSource: input.source,
      schemaJson: { schema, editorFields } as unknown as Prisma.InputJsonValue,
      defaultContent: defaultContent as Prisma.InputJsonValue,
      isActive: true,
    },
  })
}

export async function deleteCustomSection(
  organizationId: string,
  sectionId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const section = await prisma.componentDefinition.findFirst({
    where: {
      id: sectionId,
      ownerOrganizationId: organizationId,
      renderMode: 'LIQUID',
    },
    select: { id: true },
  })
  if (!section) throw new Error('Section not found')

  // PageSection.componentDefinitionId is onDelete: Restrict, so a section in
  // use would fail at the database with an opaque error. Check first and say
  // where it is used.
  const inUse = await prisma.pageSection.count({
    where: { componentDefinitionId: sectionId },
  })
  if (inUse > 0) {
    throw new Error(
      `This section is used on ${inUse} ${inUse === 1 ? 'page' : 'pages'} — remove it there first`
    )
  }

  await prisma.componentDefinition.delete({ where: { id: sectionId } })
}

export async function getStorefrontTemplateTypes(): Promise<
  StorefrontTemplateType[]
> {
  return [
    'PRODUCT',
    'COLLECTION',
    'COLLECTION_LIST',
    'CART',
    'SEARCH',
    'CUSTOMER_ACCOUNT',
    'CUSTOMER_LOGIN',
    'ORDER_STATUS',
    'NOT_FOUND',
  ]
}

export interface BuilderSectionDefinition {
  componentDefinitionId: string
  key: string
  name: string
  category: string
  /** Compiled from the {% schema %} block — the Inspector renders these. */
  editorFields: unknown[]
  defaultContent: Record<string, unknown>
}

/**
 * Custom Liquid sections available to a store's builder palette.
 *
 * Scoped to platform-global sections plus the ones this organisation owns.
 * That scoping is the whole security of the palette: without it, every store
 * on the platform would see and be able to add every other organisation's
 * custom sections, including their markup.
 */
export async function listBuilderLiquidSections(
  organizationId: string
): Promise<BuilderSectionDefinition[]> {
  return queryLiquidSections([
    { ownerOrganizationId: null },
    { ownerOrganizationId: organizationId },
  ])
}

/**
 * The platform's own Liquid sections, for the admin template builder.
 *
 * A template is sold to every tenant, so it may only be built from sections
 * every tenant has. Offering one organisation's custom section here would
 * produce a template that renders as a blank gap for everyone else.
 */
export async function listGlobalLiquidSections(): Promise<
  BuilderSectionDefinition[]
> {
  return queryLiquidSections([{ ownerOrganizationId: null }])
}

async function queryLiquidSections(
  owners: { ownerOrganizationId: string | null }[]
): Promise<BuilderSectionDefinition[]> {
  const sections = await prisma.componentDefinition.findMany({
    where: { isActive: true, renderMode: 'LIQUID', OR: owners },
    orderBy: { name: 'asc' },
  })

  return sections.map((section) => {
    const schemaJson = (section.schemaJson ?? {}) as {
      editorFields?: unknown[]
    }

    return {
      componentDefinitionId: section.id,
      key: section.key,
      name: section.name,
      category: section.category,
      editorFields: schemaJson.editorFields ?? [],
      defaultContent: (section.defaultContent ?? {}) as Record<string, unknown>,
    }
  })
}
