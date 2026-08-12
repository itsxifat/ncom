import 'server-only'
import { prisma } from '@/server/db/client'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { logAudit } from '@/server/services/auditService'
import { ADMIN_BOOTSTRAP_KEY } from '@/server/services/authService'
import type { PlatformRole } from '@/generated/prisma/enums'

export async function getPlatformOverview() {
  await requirePlatformAdmin()

  const [
    userCount,
    organizationCount,
    storeCount,
    publishedPageCount,
    templateCount,
    mediaAssetCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.store.count(),
    prisma.page.count({ where: { status: 'PUBLISHED' } }),
    prisma.template.count(),
    prisma.mediaAsset.count(),
  ])

  return {
    userCount,
    organizationCount,
    storeCount,
    publishedPageCount,
    templateCount,
    mediaAssetCount,
  }
}

// ── Users ────────────────────────────────────────────────────────────────

export async function listUsers(search?: string) {
  await requirePlatformAdmin()

  return prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function setUserPlatformRole(userId: string, role: PlatformRole) {
  const session = await requirePlatformAdmin()
  if (userId === session.user.id) {
    throw new Error('You cannot change your own role')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { platformRole: role },
  })

  await logAudit(session.user.id, 'update-role', 'User', userId, { role })
  return user
}

export async function setUserSuspended(userId: string, isSuspended: boolean) {
  const session = await requirePlatformAdmin()
  if (userId === session.user.id) {
    throw new Error('You cannot suspend your own account')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isSuspended },
  })

  await logAudit(
    session.user.id,
    isSuspended ? 'suspend' : 'unsuspend',
    'User',
    userId
  )
  return user
}

// ── Organizations ───────────────────────────────────────────────────────

export async function listOrganizations() {
  await requirePlatformAdmin()

  return prisma.organization.findMany({
    include: {
      _count: { select: { memberships: true, stores: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getOrganizationDetail(organizationId: string) {
  await requirePlatformAdmin()

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      memberships: { include: { user: true } },
      stores: { include: { _count: { select: { pages: true } } } },
    },
  })
  if (!organization) throw new Error('Organization not found')

  return organization
}

// ── Stores ────────────────────────────────────────────────────────────

export async function listAllStores() {
  await requirePlatformAdmin()

  return prisma.store.findMany({
    include: {
      organization: true,
      _count: { select: { pages: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function forceUnpublishStore(storeId: string) {
  const session = await requirePlatformAdmin()

  const result = await prisma.page.updateMany({
    where: { storeId, status: 'PUBLISHED' },
    data: { status: 'UNPUBLISHED' },
  })

  await logAudit(session.user.id, 'force-unpublish', 'Store', storeId, {
    pagesUnpublished: result.count,
  })

  return result
}

// ── Published pages (cross-tenant moderation) ──────────────────────────

export async function listPublishedPagesForModeration() {
  await requirePlatformAdmin()

  return prisma.page.findMany({
    where: { status: 'PUBLISHED' },
    include: { store: { include: { organization: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  })
}

export async function forceUnpublishPage(pageId: string) {
  const session = await requirePlatformAdmin()

  const page = await prisma.page.update({
    where: { id: pageId },
    data: { status: 'UNPUBLISHED' },
  })

  await logAudit(session.user.id, 'force-unpublish', 'Page', pageId)
  return page
}

// ── Component definitions ──────────────────────────────────────────────

export async function listComponentDefinitions() {
  await requirePlatformAdmin()

  return prisma.componentDefinition.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  })
}

export async function toggleComponentDefinitionActive(id: string) {
  const session = await requirePlatformAdmin()

  const definition = await prisma.componentDefinition.findUnique({
    where: { id },
  })
  if (!definition) throw new Error('Component not found')

  const updated = await prisma.componentDefinition.update({
    where: { id },
    data: { isActive: !definition.isActive },
  })

  await logAudit(session.user.id, 'update', 'ComponentDefinition', id, {
    isActive: updated.isActive,
  })
  return updated
}

// ── Media (platform-wide) ───────────────────────────────────────────────

export async function listAllMediaAssets() {
  await requirePlatformAdmin()

  return prisma.mediaAsset.findMany({
    include: { organization: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function getStorageUsage() {
  await requirePlatformAdmin()

  const result = await prisma.mediaAsset.aggregate({
    _sum: { sizeBytes: true },
    _count: true,
  })

  return {
    totalBytes: result._sum.sizeBytes ?? 0,
    assetCount: result._count,
  }
}

// ── Platform settings ───────────────────────────────────────────────────

export async function listPlatformSettings() {
  await requirePlatformAdmin()
  return prisma.platformSetting.findMany({ orderBy: { key: 'asc' } })
}

/**
 * Keys the raw key/value editor may not touch.
 *
 * The admin-bootstrap latch is what stops "the first user to register becomes
 * administrator" from re-arming. Deleting it would re-open that path on a live
 * platform, and it is one mis-click away in a free-text editor whose other rows
 * are all harmless feature flags.
 *
 * This is not a privilege boundary — anyone reaching this function is already a
 * platform admin and could grant roles outright. It exists so that reopening the
 * most sensitive path in the system cannot happen by accident, and has to be a
 * deliberate act at the database.
 */
const PROTECTED_SETTING_KEYS = new Set<string>([ADMIN_BOOTSTRAP_KEY])

function assertSettingIsEditable(key: string) {
  if (PROTECTED_SETTING_KEYS.has(key)) {
    throw new Error(
      `"${key}" is managed by the platform and cannot be edited here. It records that the administrator seat has been claimed; removing it would let the next account to register become an administrator.`
    )
  }
}

export async function upsertPlatformSetting(key: string, value: unknown) {
  const session = await requirePlatformAdmin()
  assertSettingIsEditable(key)

  const setting = await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  })

  await logAudit(session.user.id, 'update', 'PlatformSetting', key)
  return setting
}

export async function deletePlatformSetting(key: string) {
  const session = await requirePlatformAdmin()
  assertSettingIsEditable(key)

  await prisma.platformSetting.delete({ where: { key } })
  await logAudit(session.user.id, 'delete', 'PlatformSetting', key)
}

// ── Audit log ────────────────────────────────────────────────────────────

export async function listAuditLog() {
  await requirePlatformAdmin()

  return prisma.auditLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}
