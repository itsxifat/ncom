import 'server-only'
import sharp from 'sharp'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { storage } from '@/server/storage'
import { slugify } from '@/lib/slug'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/validation/media'
import type {
  PresignUploadInput,
  ConfirmUploadInput,
  ReplaceUploadInput,
} from '@/lib/validation/media'

const MAX_DIMENSION = 2400
const WEBP_QUALITY = 82

export async function listMediaAssets(
  organizationId: string,
  projectId?: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  return prisma.mediaAsset.findMany({
    where: { organizationId, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: 'desc' },
  })
}

export async function presignMediaUpload(
  organizationId: string,
  input: PresignUploadInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const baseName = slugify(input.fileName.replace(/\.[^./]+$/, '')) || 'file'
  const key = `org/${organizationId}/${crypto.randomUUID()}-${baseName}`

  const upload = await storage.getSignedUploadUrl(key, input.mimeType)
  return { ...upload, key }
}

function assertOwnedKey(organizationId: string, key: string) {
  if (!key.startsWith(`org/${organizationId}/`)) {
    throw new Error('Invalid upload key')
  }
}

async function verifyAndFetchUpload(organizationId: string, key: string) {
  assertOwnedKey(organizationId, key)

  const head = await storage.headObject(key)
  if (!head.exists) throw new Error('Upload not found — try again')
  if ((head.size ?? 0) > MAX_MEDIA_UPLOAD_BYTES) {
    await storage.deleteObject(key)
    throw new Error('File is too large (max 10MB)')
  }

  return storage.getObject(key)
}

/** Every upload is re-encoded so stored assets have a consistent, safe format. */
async function optimize(original: Buffer) {
  return sharp(original, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true })
}

export async function confirmMediaUpload(
  organizationId: string,
  input: ConfirmUploadInput
) {
  const { session } = await requireOrgAccess(organizationId, 'EDITOR')

  const original = await verifyAndFetchUpload(organizationId, input.key)
  const optimized = await optimize(original)

  const finalKey = `${input.key}.webp`
  await storage.putObject(finalKey, optimized.data, 'image/webp')
  await storage.deleteObject(input.key)

  return prisma.mediaAsset.create({
    data: {
      organizationId,
      projectId: input.projectId,
      uploadedById: session.user.id,
      fileName: input.fileName,
      mimeType: 'image/webp',
      sizeBytes: optimized.info.size,
      storageKey: finalKey,
      url: storage.getPublicUrl(finalKey),
      width: optimized.info.width,
      height: optimized.info.height,
      altText: input.altText,
    },
  })
}

/**
 * Re-processes a fresh upload into an *existing* MediaAsset's storage key,
 * so its public URL never changes — every section that references the URL
 * (sections store raw URLs, not asset ids) picks up the new image without
 * any edits.
 */
export async function replaceMediaAsset(
  organizationId: string,
  mediaId: string,
  input: ReplaceUploadInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, organizationId },
  })
  if (!asset) throw new Error('Media not found')

  const original = await verifyAndFetchUpload(organizationId, input.key)
  const optimized = await optimize(original)

  await storage.putObject(asset.storageKey, optimized.data, 'image/webp')
  await storage.deleteObject(input.key)

  return prisma.mediaAsset.update({
    where: { id: mediaId },
    data: {
      sizeBytes: optimized.info.size,
      width: optimized.info.width,
      height: optimized.info.height,
    },
  })
}

export async function updateMediaAssetAltText(
  organizationId: string,
  mediaId: string,
  altText: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, organizationId },
  })
  if (!asset) throw new Error('Media not found')

  return prisma.mediaAsset.update({
    where: { id: mediaId },
    data: { altText },
  })
}

export async function deleteMediaAsset(
  organizationId: string,
  mediaId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, organizationId },
  })
  if (!asset) throw new Error('Media not found')

  await storage.deleteObject(asset.storageKey)
  await prisma.mediaAsset.delete({ where: { id: mediaId } })
}
