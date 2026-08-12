import 'server-only'
import { prisma } from '@/server/db/client'
import {
  requireAuth,
  requireOrgAccess,
  requirePlatformAdmin,
} from '@/server/auth/rbac'
import { logAudit } from '@/server/services/auditService'
import {
  requireFeature,
  requireQuota,
} from '@/server/services/entitlementService'
import { slugify, withRandomSuffix } from '@/lib/slug'
import {
  provisionCommerce,
  provisionStorefrontCode,
  themeToCreateInput,
} from './storeService'
import { parseAndValidateLiquidDocument } from '@/lib/liquid/document'
import type { Prisma } from '@/generated/prisma/client'
import { DEFAULT_THEME } from '@/lib/default-theme'
import { templateThemeSchema } from '@/lib/validation/theme'
import type { PageTheme } from '@/modules/sections/types'
import type {
  CreateTemplateCategoryInput,
  CreateTemplateInput,
  UpdateTemplateMetaInput,
} from '@/lib/validation/template'

function resolveTemplateTheme(json: unknown): PageTheme {
  const parsed = templateThemeSchema.safeParse(json)
  return parsed.success ? parsed.data : DEFAULT_THEME
}

async function uniqueTemplateSlug(base: string): Promise<string> {
  const baseSlug = slugify(base) || 'template'

  const existing = await prisma.template.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.template.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique template slug')
}

// ── Reads ────────────────────────────────────────────────────────────────

export async function listTemplateCategories() {
  await requireAuth()
  return prisma.templateCategory.findMany({
    include: { _count: { select: { templates: true } } },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function listAllTemplatesForAdmin() {
  await requirePlatformAdmin()
  return prisma.template.findMany({
    include: { category: true, _count: { select: { sections: true } } },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function listPublishedTemplates() {
  await requireAuth()
  return prisma.template.findMany({
    where: { status: 'PUBLISHED' },
    include: { category: true, _count: { select: { sections: true } } },
    orderBy: { updatedAt: 'desc' },
  })
}

/**
 * A single template with its sections, for the admin builder shell and the
 * shared preview route. Admins may view any status; everyone else may only
 * view PUBLISHED templates (drafts stay invisible to tenants).
 */
export async function getTemplateForPreview(templateId: string) {
  const session = await requireAuth()

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      category: true,
      sections: {
        orderBy: { order: 'asc' },
        include: { componentDefinition: true },
      },
    },
  })
  if (!template) throw new Error('Template not found')

  if (
    template.status !== 'PUBLISHED' &&
    session.user.platformRole !== 'SUPER_ADMIN'
  ) {
    throw new Error('Template not found')
  }

  return { template, theme: resolveTemplateTheme(template.defaultTheme) }
}

export async function getTemplateForBuilder(templateId: string) {
  await requirePlatformAdmin()

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { componentDefinition: true },
      },
    },
  })
  if (!template) throw new Error('Template not found')

  return { template, theme: resolveTemplateTheme(template.defaultTheme) }
}

// ── Category mutations ──────────────────────────────────────────────────

export async function createTemplateCategory(
  input: CreateTemplateCategoryInput
) {
  const session = await requirePlatformAdmin()

  const slug = await uniqueCategorySlug(input.name)
  const count = await prisma.templateCategory.count()

  const category = await prisma.templateCategory.create({
    data: { name: input.name, slug, sortOrder: count },
  })

  await logAudit(session.user.id, 'create', 'TemplateCategory', category.id, {
    name: category.name,
  })

  return category
}

async function uniqueCategorySlug(base: string): Promise<string> {
  const baseSlug = slugify(base) || 'category'

  const existing = await prisma.templateCategory.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  })
  if (!existing) return baseSlug

  return withRandomSuffix(baseSlug)
}

export async function toggleTemplateCategoryActive(categoryId: string) {
  const session = await requirePlatformAdmin()

  const category = await prisma.templateCategory.findUnique({
    where: { id: categoryId },
  })
  if (!category) throw new Error('Category not found')

  const updated = await prisma.templateCategory.update({
    where: { id: categoryId },
    data: { isActive: !category.isActive },
  })

  await logAudit(session.user.id, 'update', 'TemplateCategory', categoryId, {
    isActive: updated.isActive,
  })

  return updated
}

export async function deleteTemplateCategory(categoryId: string) {
  const session = await requirePlatformAdmin()
  await prisma.templateCategory.delete({ where: { id: categoryId } })
  await logAudit(session.user.id, 'delete', 'TemplateCategory', categoryId)
}

// ── Template mutations ──────────────────────────────────────────────────

export async function createTemplate(input: CreateTemplateInput) {
  const session = await requirePlatformAdmin()

  const slug = await uniqueTemplateSlug(input.name)

  const template = await prisma.template.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      categoryId: input.categoryId,
      status: 'DRAFT',
      defaultTheme: DEFAULT_THEME as object,
      createdById: session.user.id,
    },
  })

  await logAudit(session.user.id, 'create', 'Template', template.id, {
    name: template.name,
  })

  return template
}

export async function updateTemplateMeta(
  templateId: string,
  input: UpdateTemplateMetaInput
) {
  const session = await requirePlatformAdmin()

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true },
  })
  if (!template) throw new Error('Template not found')

  const updated = await prisma.template.update({
    where: { id: templateId },
    data: {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId ?? null,
      status: input.status,
      isPremium: input.isPremium,
    },
  })

  await logAudit(session.user.id, 'update', 'Template', templateId, {
    status: updated.status,
  })

  return updated
}

export async function updateTemplateTheme(
  templateId: string,
  theme: PageTheme
) {
  const session = await requirePlatformAdmin()

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true },
  })
  if (!template) throw new Error('Template not found')

  const updated = await prisma.template.update({
    where: { id: templateId },
    data: { defaultTheme: theme as object },
  })

  await logAudit(session.user.id, 'update-theme', 'Template', templateId)

  return updated
}

export async function deleteTemplate(templateId: string) {
  const session = await requirePlatformAdmin()
  await prisma.template.delete({ where: { id: templateId } })
  await logAudit(session.user.id, 'delete', 'Template', templateId)
}

export interface TemplateSectionSaveInput {
  id: string
  componentDefinitionId: string
  order: number
  content: object
  config: object
  isVisible: boolean
}

/**
 * Reconciles the builder's in-memory draft with TemplateSection rows —
 * mirrors pageService's savePageSections but writes to the "default"
 * columns that seed future PageSections cloned from this template.
 */
export async function saveTemplateSections(
  templateId: string,
  sections: TemplateSectionSaveInput[]
): Promise<Record<string, string>> {
  await requirePlatformAdmin()

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true },
  })
  if (!template) throw new Error('Template not found')

  const idMapping: Record<string, string> = {}

  await prisma.$transaction(async (tx) => {
    const existingIds = new Set(
      (
        await tx.templateSection.findMany({
          where: { templateId },
          select: { id: true },
        })
      ).map((s) => s.id)
    )

    const incomingRealIds = new Set<string>()

    for (const section of sections) {
      if (section.id.startsWith('temp-')) {
        const created = await tx.templateSection.create({
          data: {
            templateId,
            componentDefinitionId: section.componentDefinitionId,
            order: section.order,
            defaultContent: section.content,
            defaultConfig: section.config,
            isVisible: section.isVisible,
          },
        })
        idMapping[section.id] = created.id
        incomingRealIds.add(created.id)
      } else {
        if (!existingIds.has(section.id)) continue
        await tx.templateSection.update({
          where: { id: section.id },
          data: {
            order: section.order,
            defaultContent: section.content,
            defaultConfig: section.config,
            isVisible: section.isVisible,
          },
        })
        incomingRealIds.add(section.id)
      }
    }

    const idsToDelete = [...existingIds].filter(
      (id) => !incomingRealIds.has(id)
    )
    if (idsToDelete.length > 0) {
      await tx.templateSection.deleteMany({
        where: { id: { in: idsToDelete } },
      })
    }
  })

  return idMapping
}

// ── Instantiation ────────────────────────────────────────────────────────

async function getPublishedTemplateWithSections(templateId: string) {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { sections: { orderBy: { order: 'asc' } } },
  })
  if (!template || template.status !== 'PUBLISHED') {
    throw new Error('Template not found')
  }
  return template
}

/**
 * Creates a new Store seeded from a template: theme comes from
 * `defaultTheme`, and a home page is cloned from the template's sections.
 */
export async function createStoreFromTemplate(
  organizationId: string,
  input: { name: string; subdomain?: string; templateId: string }
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await requireQuota(organizationId, 'STORES')
  await requireQuota(organizationId, 'PAGES')

  const template = await getPublishedTemplateWithSections(input.templateId)
  // Refused, not just hidden. The template picker filters premium templates out
  // for plans without the entitlement, but a template id is a plain string in a
  // form post and hiding a card is not a control.
  if (template.isPremium) {
    await requireFeature(organizationId, 'PREMIUM_TEMPLATES')
  }
  const theme = resolveTemplateTheme(template.defaultTheme)

  const subdomain = input.subdomain
    ? input.subdomain
    : await uniqueStoreSubdomain(input.name)

  return prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        organizationId,
        name: input.name,
        subdomain,
        theme: { create: themeToCreateInput(theme) },
      },
    })

    // A store built from a template still has to be able to sell.
    await provisionCommerce(tx, organizationId, input.name, 'USD')
    await provisionStorefrontCode(tx, store.id)

    const page = await tx.page.create({
      data: {
        storeId: store.id,
        title: 'Home',
        slug: 'home',
        isHome: true,
      },
    })

    if (template.sections.length > 0) {
      await tx.pageSection.createMany({
        data: template.sections.map((section) => ({
          pageId: page.id,
          componentDefinitionId: section.componentDefinitionId,
          order: section.order,
          content: section.defaultContent as object,
          config: section.defaultConfig as object,
          isVisible: section.isVisible,
        })),
      })
    }

    return store
  })
}

async function uniqueStoreSubdomain(base: string): Promise<string> {
  const baseSlug = slugify(base) || 'site'
  const candidate = baseSlug.length < 3 ? `${baseSlug}-site` : baseSlug

  const existing = await prisma.store.findUnique({
    where: { subdomain: candidate },
    select: { id: true },
  })
  if (!existing) return candidate

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffixed = withRandomSuffix(candidate)
    const collision = await prisma.store.findUnique({
      where: { subdomain: suffixed },
      select: { id: true },
    })
    if (!collision) return suffixed
  }

  throw new Error('Could not generate a unique subdomain')
}

/** Creates a new Page in an existing store, cloned from a template. */
export async function createPageFromTemplate(
  organizationId: string,
  storeId: string,
  input: { title: string; slug?: string; templateId: string }
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')
  await requireQuota(organizationId, 'PAGES')

  const template = await getPublishedTemplateWithSections(input.templateId)
  if (template.isPremium) {
    await requireFeature(organizationId, 'PREMIUM_TEMPLATES')
  }

  const slug = input.slug
    ? input.slug
    : await uniquePageSlug(storeId, input.title)

  const isFirstPage = (await prisma.page.count({ where: { storeId } })) === 0

  return prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: {
        storeId,
        title: input.title,
        slug,
        isHome: isFirstPage,
      },
    })

    if (template.sections.length > 0) {
      await tx.pageSection.createMany({
        data: template.sections.map((section) => ({
          pageId: page.id,
          componentDefinitionId: section.componentDefinitionId,
          order: section.order,
          content: section.defaultContent as object,
          config: section.defaultConfig as object,
          isVisible: section.isVisible,
        })),
      })
    }

    return page
  })
}

async function uniquePageSlug(storeId: string, base: string): Promise<string> {
  const baseSlug = slugify(base) || 'page'

  const existing = await prisma.page.findUnique({
    where: { storeId_slug: { storeId, slug: baseSlug } },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.page.findUnique({
      where: { storeId_slug: { storeId, slug: candidate } },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique page slug')
}

/**
 * Imports a pasted Liquid document as a template's editable layers.
 *
 * This is the whole point of the feature: one paste produces the same stack of
 * components a designer would have assembled by hand in the builder. Each
 * `{% section %}` in the document becomes its own ComponentDefinition and its
 * own TemplateSection, so after import a merchant can reorder the layers, hide
 * one, duplicate another, and edit each one's settings through the form
 * generated from its schema. Nothing is frozen by having been pasted.
 *
 * Definitions are keyed per template (`tpl-{slug}-{handle}`) so two templates
 * can both contain a section called "hero" without colliding, and re-importing
 * the same template updates its layers in place rather than accumulating
 * duplicates.
 */
export async function importTemplateLiquid(templateId: string, source: string) {
  await requirePlatformAdmin()

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, slug: true },
  })
  if (!template) throw new Error('Template not found')

  const parsed = await parseAndValidateLiquidDocument(source)
  if (parsed.error) throw new Error(parsed.error)
  if (parsed.layers.length === 0) {
    throw new Error('No sections found in that document')
  }

  return prisma.$transaction(async (tx) => {
    // Replace rather than append: re-importing a template is "here is the new
    // design", not "add another copy of it".
    await tx.templateSection.deleteMany({ where: { templateId } })

    for (const [index, layer] of parsed.layers.entries()) {
      const key = `tpl-${template.slug}-${layer.handle}`

      const definition = await tx.componentDefinition.upsert({
        where: { key },
        create: {
          key,
          name: layer.name,
          category: layer.category,
          renderMode: 'LIQUID',
          liquidSource: layer.template,
          schemaJson: {
            schema: layer.schema,
            editorFields: layer.editorFields,
          } as unknown as Prisma.InputJsonValue,
          defaultContent: layer.defaultContent as Prisma.InputJsonValue,
          isActive: true,
          sortOrder: index,
          // Platform-global, so every store that picks this template can use it.
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
          sortOrder: index,
        },
        select: { id: true },
      })

      await tx.templateSection.create({
        data: {
          templateId,
          componentDefinitionId: definition.id,
          order: index,
          defaultContent: layer.defaultContent as Prisma.InputJsonValue,
          defaultConfig: {},
          isVisible: true,
        },
      })
    }

    return tx.template.update({
      where: { id: templateId },
      data: { liquidSource: source },
    })
  })
}
