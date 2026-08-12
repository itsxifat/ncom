import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { replaceMediaAsset } from '@/server/services/mediaService'
import { parseUploadFile } from '@/lib/validation/media'
import { isTrustedOrigin } from '@/lib/security'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const { mediaId } = await params
  const { organization } = await getActiveOrganization()

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

  const file = await parseUploadFile(form)
  if ('error' in file) {
    return NextResponse.json({ error: file.error }, { status: 400 })
  }

  try {
    const asset = await replaceMediaAsset(organization.id, mediaId, file.data)
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
