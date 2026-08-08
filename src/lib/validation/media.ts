import { z } from 'zod'

// Every upload is re-encoded to WebP in confirmMediaUpload, so the storage
// key always ends in .webp regardless of the source format — accepting SVG
// here would break that invariant (vector content can't be raster-resized
// the same way), so it's out of scope for V1.
export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024

export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_MEDIA_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_MEDIA_UPLOAD_BYTES),
  projectId: z.string().trim().min(1).optional(),
})

export const confirmUploadSchema = z.object({
  key: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_MEDIA_MIME_TYPES),
  projectId: z.string().trim().min(1).optional(),
  altText: z.string().trim().max(300).optional(),
})

export const replaceUploadSchema = z.object({
  key: z.string().trim().min(1).max(500),
  mimeType: z.enum(ALLOWED_MEDIA_MIME_TYPES),
})

export type PresignUploadInput = z.infer<typeof presignUploadSchema>
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>
export type ReplaceUploadInput = z.infer<typeof replaceUploadSchema>
