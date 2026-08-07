import { NextResponse } from 'next/server'
import { registerSchema } from '@/lib/validation/auth'
import {
  registerUser,
  EmailAlreadyInUseError,
} from '@/server/services/authService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isTrustedOrigin } from '@/lib/security'

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`register:${ip}`, 5, 15 * 60)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    await registerUser(parsed.data)
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
