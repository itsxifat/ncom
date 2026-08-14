import { z } from 'zod'
import { apiError, apiOk, readPaging, withApiKey } from '@/server/api/context'
import {
  importMediaFromUrl,
  listMediaAssets,
  uploadMediaAsset,
} from '@/server/services/mediaService'
import { parseUploadFile } from '@/lib/validation/media'

/**
 * `GET  /api/v1/media` — assets in the workspace library.
 * `POST /api/v1/media` — put one in, from a URL or as a file.
 *
 * This endpoint exists because a product image is a reference to a library
 * asset, and until now nothing outside the dashboard could create one — so an
 * API client had no way to set a product image at all, and every catalogue
 * imported over the API arrived with no photographs.
 *
 * Two ways in, because integrations arrive in two shapes. A migration from
 * another shop already has its images on a CDN and wants to hand over URLs; a
 * script generating or resizing images locally has bytes. Both land as the same
 * asset, re-encoded to WebP.
 *
 * URL imports are deduplicated on the source URL, so re-running an import is
 * cheap and does not fill the library with copies.
 */

const fromUrlSchema = z.object({
  src: z.string().trim().min(1).max(2000),
  altText: z.string().trim().max(300).optional(),
})

/** Matches the dashboard uploader: sharp and the CDN are both expensive. */
const UPLOAD_LIMIT = 60
const UPLOAD_WINDOW_SECONDS = 60

export async function GET(request: Request) {
  return withApiKey('PRODUCTS_READ', async ({ organizationId }) => {
    const { limit, page, skip } = readPaging(request)
    const assets = await listMediaAssets(organizationId)

    // Paged here rather than in the query because the dashboard's own listing
    // reads the whole library and changing its signature to suit one caller
    // would be the wrong trade for a table this size.
    const window = assets.slice(skip, skip + limit)

    return apiOk({
      data: window.map((asset) => ({
        id: asset.id,
        url: asset.url,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        altText: asset.altText,
        sourceUrl: asset.sourceUrl,
        createdAt: asset.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total: assets.length,
        hasMore: skip + window.length < assets.length,
      },
    })
  })
}

export async function POST(request: Request) {
  return withApiKey('PRODUCTS_WRITE', async ({ organizationId, rateLimit }) => {
    // Re-encoding and the upstream CDN write are both far more expensive than
    // an ordinary write, so this endpoint has its own budget rather than
    // spending the shared write allowance.
    const allowed = await rateLimit(
      'media',
      UPLOAD_LIMIT,
      UPLOAD_WINDOW_SECONDS
    )
    if (allowed) return allowed

    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = await parseUploadFile(form)
      if ('error' in file) {
        return apiError('invalid_request', file.error)
      }

      const altText = form.get('altText')
      const asset = await uploadMediaAsset(
        organizationId,
        file.data,
        file.fileName,
        { altText: typeof altText === 'string' ? altText : undefined }
      )

      return apiOk({ data: serialize(asset) }, 201)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError(
        'invalid_request',
        'Send JSON with a `src` URL, or multipart/form-data with a `file` field.'
      )
    }

    const parsed = fromUrlSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('invalid_request', 'Some fields are not valid.', {
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const { asset, reused } = await importMediaFromUrl(
      organizationId,
      parsed.data.src,
      { altText: parsed.data.altText }
    )

    // 200 rather than 201 when the URL was already in the library: the caller
    // asked for this image to exist and it does, but nothing was created, and
    // a re-run of an import should be able to tell the difference.
    return apiOk({ data: { ...serialize(asset), reused } }, reused ? 200 : 201)
  })
}

function serialize(asset: {
  id: string
  url: string
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  altText: string | null
  sourceUrl: string | null
  createdAt: Date
}) {
  return {
    id: asset.id,
    url: asset.url,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    sourceUrl: asset.sourceUrl,
    createdAt: asset.createdAt.toISOString(),
  }
}

export const runtime = 'nodejs'
