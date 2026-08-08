import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { requireOrgAccess } from '@/server/auth/rbac'
import { storage } from '@/server/storage'
import { isValidStorageKey } from '@/server/storage/local.provider'
import { isTrustedOrigin } from '@/lib/security'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/validation/media'

/**
 * The local storage driver's stand-in for a presigned S3 PUT URL. Unlike a
 * real presigned URL (whose signature alone authorizes the write), this
 * route re-checks the caller's session and org membership on every
 * request — the server IS the storage here, so there's no reason to be
 * looser than the rest of the app.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (env.STORAGE_DRIVER !== 'local') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const { key: keySegments } = await params
  const key = keySegments.join('/')

  if (!isValidStorageKey(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  const organizationId = keySegments[1]
  if (keySegments[0] !== 'org' || !organizationId) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  try {
    await requireOrgAccess(organizationId, 'EDITOR')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_MEDIA_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large' }, { status: 413 })
  }

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength > MAX_MEDIA_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large' }, { status: 413 })
  }

  const contentType =
    request.headers.get('content-type') ?? 'application/octet-stream'
  await storage.putObject(key, body, contentType)

  return NextResponse.json({ success: true })
}
