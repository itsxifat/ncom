import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/server/services/organizationService'
import { confirmMediaUpload } from '@/server/services/mediaService'
import { confirmUploadSchema } from '@/lib/validation/media'
import { isTrustedOrigin } from '@/lib/security'

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const { organization } = await getActiveOrganization()

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
