export interface SignedUpload {
  url: string
  method: 'PUT'
  headers?: Record<string, string>
}

export interface ObjectHead {
  exists: boolean
  size?: number
}

/**
 * Storage is abstracted behind this interface so the media pipeline works
 * identically against S3-compatible object storage (AWS S3, Cloudflare R2)
 * and the filesystem-backed local provider used for Docker-free dev — the
 * driver is selected once, in `server/storage/index.ts`, via
 * `STORAGE_DRIVER`.
 */
export interface StorageProvider {
  /** A short-lived, direct-to-storage upload target for `key`. */
  getSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload>
  headObject(key: string): Promise<ObjectHead>
  getObject(key: string): Promise<Buffer>
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
  deleteObject(key: string): Promise<void>
  getPublicUrl(key: string): string
}
