import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import type { CreatePageInput, UpdatePageSeoInput } from '@/lib/validation/page'

async function assertProjectInOrg(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!project) throw new Error('Project not found')
}

async function uniquePageSlug(
  projectId: string,
  base: string
): Promise<string> {
  const baseSlug = slugify(base) || 'page'

  const existing = await prisma.page.findUnique({
    where: { projectId_slug: { projectId, slug: baseSlug } },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.page.findUnique({
      where: { projectId_slug: { projectId, slug: candidate } },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique page slug')
}

export async function listPages(organizationId: string, projectId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertProjectInOrg(organizationId, projectId)

  return prisma.page.findMany({
    where: { projectId },
    orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function createPage(
  organizationId: string,
  projectId: string,
  input: CreatePageInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertProjectInOrg(organizationId, projectId)

  const slug = input.slug
    ? input.slug
    : await uniquePageSlug(projectId, input.title)

  if (input.slug) {
    const collision = await prisma.page.findUnique({
      where: { projectId_slug: { projectId, slug: input.slug } },
    })
    if (collision) throw new Error('This slug is already used on this project')
  }

  const isFirstPage = (await prisma.page.count({ where: { projectId } })) === 0

  return prisma.page.create({
    data: {
      projectId,
      title: input.title,
      slug,
      isHome: isFirstPage,
    },
  })
}

export async function updatePageSeo(
  organizationId: string,
  projectId: string,
  pageId: string,
  input: UpdatePageSeoInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertProjectInOrg(organizationId, projectId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  const collision = await prisma.page.findFirst({
    where: { projectId, slug: input.slug, NOT: { id: pageId } },
    select: { id: true },
  })
  if (collision) throw new Error('This slug is already used on this project')

  if (input.ogImageMediaId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: input.ogImageMediaId, organizationId },
      select: { id: true },
    })
    if (!asset) throw new Error('Image not found')
  }

  return prisma.page.update({
    where: { id: pageId },
    data: {
      title: input.title,
      slug: input.slug,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      ogImageMediaId: input.ogImageMediaId || null,
      robotsIndex: input.robotsIndex,
    },
  })
}

export async function getPageForSeoSettings(
  organizationId: string,
  projectId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertProjectInOrg(organizationId, projectId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId },
    include: { ogImage: true },
  })
  if (!page) throw new Error('Page not found')

  return page
}

export async function getPageWithSections(
  organizationId: string,
  projectId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertProjectInOrg(organizationId, projectId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { componentDefinition: true },
      },
      project: { include: { theme: true } },
    },
  })
  if (!page) throw new Error('Page not found')

  return page
}

/**
 * Resolves a page's tenant from the page id alone (no org/project in the
 * URL) and authorizes against it — used by the chrome-free render route
 * embedded in an iframe by both the authenticated preview and, later, the
 * visual builder's canvas.
 */
export async function getPageForRawPreview(pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { projectId: true, project: { select: { organizationId: true } } },
  })
  if (!page) throw new Error('Page not found')

  return getPageWithSections(
    page.project.organizationId,
    page.projectId,
    pageId
  )
}

/**
 * Resolves a page by its shareable `previewToken` — deliberately unauthenticated
 * (the token itself, a random cuid, is the credential) so a client can be
 * sent a link to sign off on a draft before it's published. Renders live
 * section rows, not a published snapshot, since the whole point is
 * previewing unpublished work.
 */
export async function getPageByPreviewToken(token: string) {
  const page = await prisma.page.findUnique({
    where: { previewToken: token },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { componentDefinition: true },
      },
      project: { include: { theme: true } },
    },
  })
  if (!page) throw new Error('Page not found')

  return page
}

export interface SectionSaveInput {
  id: string
  componentDefinitionId: string
  order: number
  content: object
  config: object
  isVisible: boolean
}

/**
 * Reconciles the builder's in-memory draft with PageSection rows: creates
 * rows for client-generated temp ids, updates the rest, and deletes any
 * row no longer present in the incoming list (sections removed in the
 * editor since the last save). Returns a tempId -> realId map so the
 * client can reconcile its own state after a successful save.
 */
export async function savePageSections(
  organizationId: string,
  projectId: string,
  pageId: string,
  sections: SectionSaveInput[]
): Promise<Record<string, string>> {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertProjectInOrg(organizationId, projectId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  const idMapping: Record<string, string> = {}

  await prisma.$transaction(async (tx) => {
    const existingIds = new Set(
      (
        await tx.pageSection.findMany({
          where: { pageId },
          select: { id: true },
        })
      ).map((s) => s.id)
    )

    const incomingRealIds = new Set<string>()

    for (const section of sections) {
      if (section.id.startsWith('temp-')) {
        const created = await tx.pageSection.create({
          data: {
            pageId,
            componentDefinitionId: section.componentDefinitionId,
            order: section.order,
            content: section.content,
            config: section.config,
            isVisible: section.isVisible,
          },
        })
        idMapping[section.id] = created.id
        incomingRealIds.add(created.id)
      } else {
        if (!existingIds.has(section.id)) continue
        await tx.pageSection.update({
          where: { id: section.id },
          data: {
            order: section.order,
            content: section.content,
            config: section.config,
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
      await tx.pageSection.deleteMany({ where: { id: { in: idsToDelete } } })
    }
  })

  return idMapping
}

export async function deletePage(
  organizationId: string,
  projectId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertProjectInOrg(organizationId, projectId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, projectId },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  await prisma.page.delete({ where: { id: page.id } })
}
