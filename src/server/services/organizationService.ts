import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/server/db/client'
import { requireAuth, requireOrgAccess } from '@/server/auth/rbac'
import { slugify, withRandomSuffix } from '@/lib/slug'

const ACTIVE_ORG_COOKIE = 'ncom_active_org'

/**
 * Resolves which organization the current dashboard request is scoped to:
 * the cookie's org if the caller is still a member of it, otherwise their
 * first membership. Always derives the user from a freshly-verified
 * session — never takes a userId parameter — so it can only ever return
 * the caller's own memberships. Redirects to login if there is no session,
 * and back to login if the user somehow has no memberships at all.
 */
export async function getActiveOrganization() {
  const session = await requireAuth()

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  })

  if (memberships.length === 0) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value

  const active =
    memberships.find((m) => m.organizationId === activeOrgId) ?? memberships[0]

  return {
    session,
    organization: active.organization,
    role: active.role,
    memberships,
  }
}

export async function setActiveOrganizationCookie(organizationId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * Renames an organisation and reslugs it.
 *
 * The slug is derived rather than user-supplied: it only appears in internal
 * URLs, and letting it drift from the name is a support burden with no upside.
 */
export async function updateOrganization(
  organizationId: string,
  input: { name: string }
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const slug = await uniqueOrgSlugExcluding(input.name, organizationId)

  return prisma.organization.update({
    where: { id: organizationId },
    data: { name: input.name, slug },
  })
}

async function uniqueOrgSlugExcluding(
  base: string,
  excludeId: string
): Promise<string> {
  const baseSlug = slugify(base) || 'workspace'

  const existing = await prisma.organization.findFirst({
    where: { slug: baseSlug, NOT: { id: excludeId } },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique workspace address')
}

/** Every organisation the signed-in user belongs to, for the switcher. */
export async function listMyOrganizations() {
  const session = await requireAuth()

  return prisma.membership.findMany({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: { _count: { select: { stores: true, memberships: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}
