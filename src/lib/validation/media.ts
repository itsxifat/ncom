import { z } from 'zod'

// Every upload is re-encoded to WebP in uploadMediaAsset, so the file that
// reaches the CDN is always WebP regardless of the source format —
// accepting SVG here would break that invariant (vector content can't be
// raster-resized the same way), so it's out of scope for V1.
export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * The non-file fields of the upload's `multipart/form-data` body. The file
 * itself is validated by `parseUploadFile` — zod can't meaningfully check a
 * `File`'s bytes.
 */
export const uploadMetadataSchema = z.object({
  storeId: z.string().trim().min(1).optional(),
  altText: z.string().trim().max(300).optional(),
})

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>

/**
 * The region of an image to keep, as fractions of its own width and height
 * rather than pixels.
 *
 * Fractions because the browser hands this over from a crop box drawn on a
 * scaled-down preview, and it is the server that knows the real dimensions.
 * Sending pixels would mean trusting the client's idea of how big the image is,
 * and being wrong by the preview's scale factor.
 */
export const cropRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1),
  })
  .refine((rect) => rect.x + rect.width <= 1.0001, {
    message: 'Crop extends past the right edge',
  })
  .refine((rect) => rect.y + rect.height <= 1.0001, {
    message: 'Crop extends past the bottom edge',
  })

export type CropRectInput = z.infer<typeof cropRectSchema>

export type ParsedUploadFile = {
  data: Buffer
  fileName: string
}

/**
 * Pulls the `file` field out of a multipart body and enforces type and
 * size limits before any of it reaches sharp or the CDN. Returns a string
 * on rejection so route handlers can surface the reason verbatim.
 */
export async function parseUploadFile(
  form: FormData
): Promise<ParsedUploadFile | { error: string }> {
  const file = form.get('file')
  if (!(file instanceof File)) {
    return { error: 'No file was uploaded' }
  }

  if (!(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { error: 'Unsupported file type — use PNG, JPEG, WebP, or GIF' }
  }

  if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
    return { error: 'File is too large (max 10MB)' }
  }

  const data = Buffer.from(await file.arrayBuffer())
  // `file.size` is client-reported for the purposes of the check above;
  // re-check once the bytes are actually in hand.
  if (data.byteLength > MAX_MEDIA_UPLOAD_BYTES) {
    return { error: 'File is too large (max 10MB)' }
  }

  const fileName = file.name?.trim().slice(0, 200) || 'upload'
  return { data, fileName }
}
