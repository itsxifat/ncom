import 'server-only'
import { env } from '@/lib/env'
import type { StorageProvider } from './storage.interface'
import { LocalStorageProvider } from './local.provider'
import { S3StorageProvider } from './s3.provider'

export const storage: StorageProvider =
  env.STORAGE_DRIVER === 's3'
    ? new S3StorageProvider()
    : new LocalStorageProvider()

export type { StorageProvider } from './storage.interface'
