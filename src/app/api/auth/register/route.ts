import { NextResponse } from 'next/server'
import { registerSchema } from '@/lib/validation/auth'
import {
  registerUser,
  EmailAlreadyInUseError,
} from '@/server/services/authService'

export async function POST(request: Request) {
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
