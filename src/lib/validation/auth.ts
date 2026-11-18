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

/** The password rule, shared by sign-up and password reset. */
export const newPasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters for your password')
  .max(200, 'That password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name')
    .max(100, 'That name is too long'),
  email: z.email('Enter a valid email address').trim(),
  password: newPasswordSchema,
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

/** Asking for a reset code: just the address. */
export const passwordResetRequestSchema = z.object({
  email: z.email('Enter a valid email address').trim(),
})

/** Setting the new password with the code that was emailed. */
export const passwordResetSchema = z.object({
  email: z.email('Enter a valid email address').trim(),
  code: otpCodeSchema.shape.code,
  password: newPasswordSchema,
})

/**
 * The first onboarding step: what the business is called, what it sells and
 * where it is starting from. Only the name and the starting point are stored;
 * what it sells picks the templates suggested at the end.
 */
export const ONBOARDING_CATEGORIES = [
  'fashion',
  'beauty',
  'food',
  'gadgets',
  'home',
  'other',
] as const

export const onboardingBusinessSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Enter your business name')
    .max(80, 'Keep the name under 80 characters'),
  category: z.enum(ONBOARDING_CATEGORIES).optional(),
  purpose: z.enum([
    'START_SELLING',
    'MOVE_EXISTING_STORE',
    'BUILD_FOR_CLIENT',
    'JUST_EXPLORING',
  ]),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type OtpCodeInput = z.infer<typeof otpCodeSchema>
