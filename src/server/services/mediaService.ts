import 'server-only'
import sharp from 'sharp'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db/client'
import { requireOrgAccess, requireHumanOrgAccess } from '@/server/auth/rbac'
import { requireQuota } from '@/server/services/entitlementService'
import { uploadToCdn, deleteFromCdn } from '@/server/storage'
import { slugify } from '@/lib/slug'
import {
  MAX_MEDIA_UPLOAD_BYTES,
  type UploadMetadataInput,
} from '@/lib/validation/media'

const MAX_DIMENSION = 2400
const WEBP_QUALITY = 82

export async function listMediaAssets(
  organizationId: string,
  storeId?: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  return prisma.mediaAsset.findMany({
    where: { organizationId, ...(storeId ? { storeId } : {}) },
    orderBy: { createdAt: 'desc' },
  })
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

/** The name EnCDN records as `originalName`, for legibility in its admin UI. */
function cdnFileName(organizationId: string, fileName: string) {
  const base = slugify(fileName.replace(/\.[^./]+$/, '')) || 'file'
  return `${organizationId}-${base}.webp`
}

/**
 * Stores bytes as a MediaAsset.
 *
 * Deliberately `requireOrgAccess` rather than `requireHumanOrgAccess`: an API
 * key importing a catalogue has to be able to bring the photographs with it,
 * and uploading an image is content creation rather than an act that has to be
 * attributed to a person for the record. `uploadedById` is simply null for a
 * machine actor instead of borrowing the name of whoever created the key.
 */
export async function uploadMediaAsset(
  organizationId: string,
  data: Buffer,
  fileName: string,
  input: UploadMetadataInput & { sourceUrl?: string | null }
) {
  const { session } = await requireOrgAccess(organizationId, 'EDITOR')

  const optimized = await optimize(data)

  // Checked after re-encoding and before the CDN write: the stored WebP is what
  // counts against the quota (often a fraction of the upload), and refusing
  // before the upload means a rejected file never reaches the CDN to be
  // orphaned there.
  await requireQuota(organizationId, 'STORAGE_BYTES', optimized.info.size)

  const uploaded = await uploadToCdn(
    optimized.data,
    cdnFileName(organizationId, fileName),
    'image/webp'
  )

  return prisma.mediaAsset.create({
    data: {
      organizationId,
      storeId: input.storeId,
      uploadedById: session?.user.id ?? null,
      fileName,
      mimeType: 'image/webp',
      sizeBytes: optimized.info.size,
      storageKey: uploaded.filename,
      url: uploaded.url,
      width: optimized.info.width,
      height: optimized.info.height,
      altText: input.altText,
      sourceUrl: input.sourceUrl ?? null,
    },
  })
}

/**
 * Pulls an image from a URL into the media library.
 *
 * This is what makes a catalogue import able to carry its artwork. Products
 * reference a `mediaId`, and until now nothing outside the dashboard could
 * produce one — so every API-driven migration arrived with no photographs,
 * which is not a migration.
 *
 * Idempotent on the source URL. A re-run of an import must not re-download the
 * same 370 photos, re-encode them, pay for the storage twice and leave the
 * product pointing at a second copy.
 */
export async function importMediaFromUrl(
  organizationId: string,
  sourceUrl: string,
  options: { altText?: string; storeId?: string } = {}
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const url = assertFetchableImageUrl(sourceUrl)

  const existing = await prisma.mediaAsset.findFirst({
    where: { organizationId, sourceUrl: url },
    orderBy: { createdAt: 'desc' },
  })
  // Reported rather than inferred from the row's age: a caller re-running an
  // import wants to know whether this cost a download, and a timestamp
  // comparison would call a fresh dedup hit a creation.
  if (existing) return { asset: existing, reused: true }

  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      headers: { Accept: 'image/*' },
    })
  } catch (cause) {
    throw new Error(
      cause instanceof Error && cause.name === 'TimeoutError'
        ? `Timed out fetching ${url}`
        : `Could not fetch ${url}`
    )
  }

  if (!response.ok) {
    throw new Error(`Could not fetch ${url} — it returned ${response.status}`)
  }

  const contentType = (response.headers.get('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase()

  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(
      `${url} is ${contentType}, not an image. Check the URL points at the file, not a page about it.`
    )
  }

  // Checked before reading the body as well as after: a declared length lets a
  // huge file be refused without transferring it, but the header is the
  // sender's claim, so the bytes in hand are checked too.
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_MEDIA_UPLOAD_BYTES) {
    throw new Error(`${url} is larger than the 10MB limit`)
  }

  const data = Buffer.from(await response.arrayBuffer())
  if (data.byteLength === 0) throw new Error(`${url} returned an empty file`)
  if (data.byteLength > MAX_MEDIA_UPLOAD_BYTES) {
    throw new Error(`${url} is larger than the 10MB limit`)
  }

  const fileName = fileNameFromUrl(url)

  try {
    const asset = await uploadMediaAsset(organizationId, data, fileName, {
      altText: options.altText,
      storeId: options.storeId,
      sourceUrl: url,
    })
    return { asset, reused: false }
  } catch (cause) {
    // sharp throws on anything it cannot decode. That is bad input — a broken
    // file, an HTML error page served with an image content-type — and the
    // caller needs to know which URL, not a decoder's internal message.
    if (
      cause instanceof Error &&
      /input|decode|unsupported|format/i.test(cause.message)
    ) {
      throw new Error(`${url} could not be read as an image`)
    }
    throw cause
  }
}

/** Long enough for a slow origin, short enough that 250 of them cannot hang a request. */
const IMAGE_FETCH_TIMEOUT_MS = 15_000

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    return (last && decodeURIComponent(last).slice(0, 200)) || 'image'
  } catch {
    return 'image'
  }
}

/**
 * Refuses URLs we should not be fetching on a merchant's behalf.
 *
 * The URL comes from an API caller and this server is what dials it, which is
 * the textbook SSRF shape: without a check, `POST /media { src:
 * "http://169.254.169.254/latest/meta-data/" }` turns the image importer into a
 * way to read cloud credentials. Loopback, link-local and private ranges are
 * refused, and only http/https are allowed — `file://` would otherwise read
 * from disk.
 *
 * This is a literal-address check, not DNS resolution: a hostname that resolves
 * to a private address still passes. Egress policy at the network layer is the
 * real backstop; this stops the direct attempts and the honest mistakes.
 */
export function assertFetchableImageUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error(`"${raw}" is not a valid URL`)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Image URLs must be http or https')
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host)
  ) {
    throw new Error('That address is not reachable from the public internet')
  }

  return url.toString()
}

/**
 * Rewrites every reference to `fromUrl` in the organization's *draft*
 * content so a replaced image shows up on the pages already using it.
 *
 * EnCDN assigns a fresh UUID filename to every upload and offers no way to
 * write back to an existing one, so a replacement always lands on a new
 * URL and the references have to move with it.
 *
 * Sections store image URLs as bare strings under per-component field
 * names (`imageUrl`, `avatarUrl`, `posterUrl`, …), so this is a text-level
 * substitution over the JSONB. That is safe here because both URLs consist
 * only of URL characters, none of which carry meaning inside a JSON string
 * literal.
 *
 * Published `PageVersion` snapshots are deliberately left alone: they are
 * immutable records of what was published, and the old file is kept on the
 * CDN so they keep rendering until the page is republished.
 */
async function rewriteContentReferences(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fromUrl: string,
  toUrl: string
) {
  await tx.$executeRaw`
    UPDATE "PageSection" AS ps
    SET content = REPLACE(ps.content::text, ${fromUrl}, ${toUrl})::jsonb
    FROM "Page" AS p
    JOIN "Store" AS pr ON pr.id = p."storeId"
    WHERE ps."pageId" = p.id
      AND pr."organizationId" = ${organizationId}
      AND ps.content::text LIKE ${'%' + fromUrl + '%'}
  `

  // Templates are global rather than org-scoped, but the template builder
  // uploads through the active organization's media library, so a template
  // section can hold a URL owned by this org.
  await tx.$executeRaw`
    UPDATE "TemplateSection"
    SET "defaultContent" = REPLACE("defaultContent"::text, ${fromUrl}, ${toUrl})::jsonb
    WHERE "defaultContent"::text LIKE ${'%' + fromUrl + '%'}
  `
}

/**
 * Whether any currently-published page still renders `url`. Published
 * snapshots are immutable, so if one references the old file it has to
 * stay on the CDN or the live site would 404 on it until republished.
 */
async function isUrlPublished(organizationId: string, url: string) {
  const rows = await prisma.$queryRaw<{ one: number }[]>`
    SELECT 1 AS one
    FROM "PageVersion" AS pv
    JOIN "Page" AS p ON p."publishedVersionId" = pv.id
    JOIN "Store" AS pr ON pr.id = p."storeId"
    WHERE pr."organizationId" = ${organizationId}
      AND pv.snapshot::text LIKE ${'%' + url + '%'}
    LIMIT 1
  `
  return rows.length > 0
}

/**
 * Swaps the file behind an existing MediaAsset: uploads the replacement,
 * repoints the asset and everything referencing its URL, then drops the
 * old file from the CDN unless a published snapshot still needs it.
 */
export async function replaceMediaAsset(
  organizationId: string,
  mediaId: string,
  data: Buffer
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, organizationId },
  })
  if (!asset) throw new Error('Media not found')

  const optimized = await optimize(data)
  const uploaded = await uploadToCdn(
    optimized.data,
    cdnFileName(organizationId, asset.fileName),
    'image/webp'
  )

  // Repoint everything before deleting the old file, so a failure here
  // leaves the asset pointing at something that still exists. The asset
  // row and the references to it move together or not at all.
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.mediaAsset.update({
      where: { id: mediaId },
      data: {
        storageKey: uploaded.filename,
        url: uploaded.url,
        sizeBytes: optimized.info.size,
        width: optimized.info.width,
        height: optimized.info.height,
      },
    })
    await rewriteContentReferences(tx, organizationId, asset.url, uploaded.url)
    return next
  })

  // Best-effort: an orphaned file on the CDN is a smaller problem than a
  // replace that reports failure after it has already succeeded.
  try {
    if (!(await isUrlPublished(organizationId, asset.url))) {
      await deleteFromCdn(asset.storageKey)
    }
  } catch (error) {
    console.error('Failed to delete replaced CDN file:', error)
  }

  return updated
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

  await deleteFromCdn(asset.storageKey)
  await prisma.mediaAsset.delete({ where: { id: mediaId } })
}
