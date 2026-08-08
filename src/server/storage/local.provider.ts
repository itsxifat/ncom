import 'server-only'
import { mkdir, readFile, writeFile, rm, stat } from 'fs/promises'
import { join, dirname } from 'path'
import type {
  StorageProvider,
  SignedUpload,
  ObjectHead,
} from './storage.interface'

// Outside `.env`-configured S3, keep everything under public/ so the
// filesystem write in confirmMediaUpload doubles as the serving path — no
// extra streaming route needed, matching how a real CDN would front S3.
const STORAGE_ROOT = join(process.cwd(), 'public', 'media-uploads')

/** Rejects traversal and anything that isn't a plain relative path. */
export function isValidStorageKey(key: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) && !key.includes('..')
}

function resolvePath(key: string): string {
  if (!isValidStorageKey(key)) {
    throw new Error('Invalid storage key')
  }
  return join(STORAGE_ROOT, key)
}

/**
 * Filesystem-backed provider for Docker-free local dev (no MinIO/S3
 * needed). `getSignedUploadUrl` points at `/api/media/local-put/[...key]`,
 * a same-origin Route Handler that re-checks the caller's org membership
 * on every write — stricter than a real presigned URL, which is fine here
 * since "signing" is a formality when the server IS the storage.
 */
export class LocalStorageProvider implements StorageProvider {
  async getSignedUploadUrl(
    key: string,
    contentType: string
  ): Promise<SignedUpload> {
    return {
      url: `/api/media/local-put/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    }
  }

  async headObject(key: string): Promise<ObjectHead> {
    try {
      const info = await stat(resolvePath(key))
      return { exists: true, size: info.size }
    } catch {
      return { exists: false }
    }
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(resolvePath(key))
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const path = resolvePath(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }

  async deleteObject(key: string): Promise<void> {
    await rm(resolvePath(key), { force: true })
  }

  getPublicUrl(key: string): string {
    return `/media-uploads/${key}`
  }
}
