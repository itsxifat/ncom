import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { uploadMediaAsset } from '@/server/services/mediaService'
import { uploadMetadataSchema, parseUploadFile } from '@/lib/validation/media'
import { isTrustedOrigin } from '@/lib/security'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * Uploads go through the server rather than straight to storage: EnCDN
 * authenticates with an API key and secret that must never reach the
 * browser, and routing the bytes through here is also what lets sharp
 * re-encode them before anything is stored.
 */
export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const { organization } = await getActiveOrganization()

  // Both the sharp re-encode and the upstream CDN upload are expensive,
  // and this is now the single entry point for both.
  const rateLimit = await checkRateLimit(
    `media-upload:${organization.id}`,
    30,
    60
  )
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    )
  }

  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const parsed = uploadMetadataSchema.safeParse({
    storeId: form.get('storeId') ?? undefined,
    altText: form.get('altText') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const file = await parseUploadFile(form)
  if ('error' in file) {
    return NextResponse.json({ error: file.error }, { status: 400 })
  }

  try {
    const asset = await uploadMediaAsset(
      organization.id,
      file.data,
      file.fileName,
      parsed.data
    )
    return NextResponse.json(asset)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 400 }
    )
  }
}
