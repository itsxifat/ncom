import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { confirmMediaUpload } from '@/server/services/mediaService'
import { confirmUploadSchema } from '@/lib/validation/media'
import { isTrustedOrigin } from '@/lib/security'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const { organization } = await getActiveOrganization()

  // sharp's resize/re-encode is CPU-bound — worth its own limit even
  // though reaching this endpoint already requires a completed presign+PUT.
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
  const parsed = confirmUploadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    const asset = await confirmMediaUpload(organization.id, parsed.data)
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
