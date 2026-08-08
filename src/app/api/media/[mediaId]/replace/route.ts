import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { replaceMediaAsset } from '@/server/services/mediaService'
import { replaceUploadSchema } from '@/lib/validation/media'
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
    `media-confirm:${organization.id}`,
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

  const body = await request.json().catch(() => null)
  const parsed = replaceUploadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    const asset = await replaceMediaAsset(organization.id, mediaId, parsed.data)
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
