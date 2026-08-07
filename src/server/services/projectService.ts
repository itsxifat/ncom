import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from '@/lib/validation/project'

async function uniqueSubdomain(base: string): Promise<string> {
  let baseSlug = slugify(base) || 'site'
  if (baseSlug.length < 3) baseSlug = `${baseSlug}-site`
  if (RESERVED_SUBDOMAINS.has(baseSlug)) baseSlug = withRandomSuffix(baseSlug)

  const existing = await prisma.project.findUnique({
    where: { subdomain: baseSlug },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.project.findUnique({
      where: { subdomain: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique subdomain')
}

const DEFAULT_THEME = {
  primaryColor: '#2563eb',
  secondaryColor: '#7c3aed',
  backgroundColor: '#ffffff',
  textColor: '#0f172a',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  buttonStyle: 'SOLID' as const,
  borderRadius: 'md',
  spacingScale: 'comfortable',
  containerWidth: '1200px',
}

export async function listProjects(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.project.findMany({
    where: { organizationId },
    include: { _count: { select: { pages: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getProject(organizationId: string, projectId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
  })
  if (!project) throw new Error('Project not found')
  return project
}

export async function createProject(
  organizationId: string,
  input: CreateProjectInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const subdomain = input.subdomain
    ? input.subdomain
    : await uniqueSubdomain(input.name)

  if (input.subdomain) {
    const collision = await prisma.project.findUnique({
      where: { subdomain: input.subdomain },
      select: { id: true },
    })
    if (collision) throw new Error('This subdomain is already taken')
  }

  return prisma.project.create({
    data: {
      organizationId,
      name: input.name,
      subdomain,
      theme: { create: DEFAULT_THEME },
    },
  })
}

export async function updateProject(
  organizationId: string,
  projectId: string,
  input: UpdateProjectInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!project) throw new Error('Project not found')

  if (input.subdomain) {
    const collision = await prisma.project.findFirst({
      where: { subdomain: input.subdomain, NOT: { id: project.id } },
      select: { id: true },
    })
    if (collision) throw new Error('This subdomain is already taken')
  }

  return prisma.project.update({
    where: { id: project.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.subdomain ? { subdomain: input.subdomain } : {}),
    },
  })
}

export async function deleteProject(organizationId: string, projectId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!project) throw new Error('Project not found')

  await prisma.project.delete({ where: { id: project.id } })
}

export async function duplicateProject(
  organizationId: string,
  projectId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const original = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    include: { theme: true, pages: { include: { sections: true } } },
  })
  if (!original) throw new Error('Project not found')

  const subdomain = await uniqueSubdomain(`${original.name}-copy`)

  return prisma.$transaction(async (tx) => {
    const copy = await tx.project.create({
      data: {
        organizationId,
        name: `${original.name} (Copy)`,
        subdomain,
        isSearchIndexable: original.isSearchIndexable,
        theme: original.theme
          ? {
              create: {
                primaryColor: original.theme.primaryColor,
                secondaryColor: original.theme.secondaryColor,
                backgroundColor: original.theme.backgroundColor,
                textColor: original.theme.textColor,
                headingFont: original.theme.headingFont,
                bodyFont: original.theme.bodyFont,
                buttonStyle: original.theme.buttonStyle,
                borderRadius: original.theme.borderRadius,
                spacingScale: original.theme.spacingScale,
                containerWidth: original.theme.containerWidth,
                customCss: original.theme.customCss,
              },
            }
          : { create: DEFAULT_THEME },
      },
    })

    for (const page of original.pages) {
      const newPage = await tx.page.create({
        data: {
          projectId: copy.id,
          slug: page.slug,
          title: page.title,
          isHome: page.isHome,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          robotsIndex: page.robotsIndex,
        },
      })

      if (page.sections.length > 0) {
        await tx.pageSection.createMany({
          data: page.sections.map((section) => ({
            pageId: newPage.id,
            componentDefinitionId: section.componentDefinitionId,
            order: section.order,
            content: section.content as object,
            config: section.config as object,
            isVisible: section.isVisible,
          })),
        })
      }
    }

    return copy
  })
}
