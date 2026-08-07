import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import type { CreatePageInput } from '@/lib/validation/page'

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
