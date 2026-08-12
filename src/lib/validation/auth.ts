import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const SIGNUP_PURPOSES = [
  { value: 'START_SELLING', label: "I'm starting a new store" },
  { value: 'MOVE_EXISTING_STORE', label: "I'm moving an existing store here" },
  { value: 'BUILD_FOR_CLIENT', label: "I'm building for a client" },
  { value: 'JUST_EXPLORING', label: 'Just having a look' },
] as const

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim(),
  password: z
    .string()
    .min(8)
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  // Asked once, at signup. Optional so a failure to answer never blocks
  // account creation — the point is to shape onboarding, not to gate it.
  purpose: z
    .enum([
      'START_SELLING',
      'MOVE_EXISTING_STORE',
      'BUILD_FOR_CLIENT',
      'JUST_EXPLORING',
    ])
    .optional(),
})

/**
 * Six digits, nothing else. Stripping spaces first because the code arrives by
 * email and people paste it with whatever whitespace came along.
 */
export const otpCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(
      z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email')
    ),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type OtpCodeInput = z.infer<typeof otpCodeSchema>
