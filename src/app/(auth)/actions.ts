'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/server/auth/auth'
import { loginSchema, registerSchema } from '@/lib/validation/auth'
import {
  registerUser,
  EmailAlreadyInUseError,
} from '@/server/services/authService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export type AuthActionState = { error?: string } | undefined

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`login:${ip}`, 10, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again in a few minutes.' }
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: 'Enter a valid email and password.' }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Invalid email or password.' }
    }
    throw error
  }
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`register:${ip}`, 5, 15 * 60)
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again in a few minutes.' }
  }

  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? 'Check your details and try again.' }
  }

  try {
    await registerUser(parsed.data)
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      return { error: error.message }
    }
    throw error
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Account created — please sign in.' }
    }
    throw error
  }
}
