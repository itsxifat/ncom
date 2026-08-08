import 'server-only'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/lib/env'
import type {
  StorageProvider,
  SignedUpload,
  ObjectHead,
} from './storage.interface'

const UPLOAD_URL_TTL_SECONDS = 300

/** S3-compatible provider — works against AWS S3, Cloudflare R2, or MinIO. */
export class S3StorageProvider implements StorageProvider {
  private client: S3Client
  private bucket: string
  private publicUrl: string

  constructor() {
    if (
      !env.S3_ENDPOINT ||
      !env.S3_REGION ||
      !env.S3_BUCKET ||
      !env.S3_ACCESS_KEY_ID ||
      !env.S3_SECRET_ACCESS_KEY ||
      !env.S3_PUBLIC_URL
    ) {
      throw new Error('S3 storage is misconfigured — see .env.example')
    }

    this.bucket = env.S3_BUCKET
    this.publicUrl = env.S3_PUBLIC_URL.replace(/\/$/, '')
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      // Path-style addressing is required by R2/MinIO and works fine
      // against real AWS S3 too, so one client config covers all targets.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    })
  }

  async getSignedUploadUrl(
    key: string,
    contentType: string
  ): Promise<SignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    })
    const url = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    })
    return { url, method: 'PUT', headers: { 'Content-Type': contentType } }
  }

  async headObject(key: string): Promise<ObjectHead> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      )
      return { exists: true, size: result.ContentLength }
    } catch {
      return { exists: false }
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    )
    const bytes = await result.Body?.transformToByteArray()
    if (!bytes) throw new Error(`Object not found: ${key}`)
    return Buffer.from(bytes)
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    )
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`
  }
}
