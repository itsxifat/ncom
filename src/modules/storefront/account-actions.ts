'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import {
  authenticateCustomer,
  logoutCustomer,
  registerCustomer,
} from '@/server/services/customerService'
import { attachCartToCustomer } from '@/server/services/cartService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import {
  CUSTOMER_COOKIE_MAX_AGE,
  CUSTOMER_SESSION_COOKIE,
  storefrontCookieOptions,
} from '@/lib/storefront-cookies'
import { readCartToken, requestStore } from '@/server/storefront/request'
import { latinDigits } from '@/modules/sections/language'
import { DEFAULT_STORE_TEXT, storeText, type StoreText } from './i18n'
import { safeNextPath } from './safe-next'

/**
 * Shopper accounts on an online store.
 *
 * These are the store's customers, not NCOM users — they sign in to one shop,
 * on that shop's own address, and nothing they can do reaches a merchant's
 * dashboard (see customerService for why that boundary is a security one).
 * The session cookie is set on the store's hostname only.
 *
 * Sign-in attempts are rate limited per address and per account: a password
 * box with no limit is an invitation to try every password.
 */

export type AccountFormState =
  { error?: string; ok?: boolean; redirect?: string } | undefined

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.email('Enter a valid email address').max(200),
  // Stored in 0-9 whatever keyboard typed it: checkout pre-fills the shopper's
  // phone from here, and checks it as a Bangladeshi mobile number.
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((value) => latinDigits(value))
    .optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})

const loginSchema = z.object({
  email: z.email('Enter your email address').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
})

async function startSession(
  organizationId: string,
  customerId: string,
  token: string
) {
  const jar = await cookies()
  jar.set(CUSTOMER_SESSION_COOKIE, token, {
    ...storefrontCookieOptions,
    maxAge: CUSTOMER_COOKIE_MAX_AGE,
  })
  // The cart they built before signing in comes with them.
  const cartToken = await readCartToken()
  if (cartToken)
    await attachCartToCustomer(organizationId, cartToken, customerId)
}

export async function registerAction(
  _prev: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const store = await requestStore()
  if (!store) {
    return { error: DEFAULT_STORE_TEXT.words.errors.accountsUnavailable }
  }
  const text = storeText(store.theme)
  const errors = text.words.errors

  const ip = await getClientIp()
  const limit = await checkRateLimit(
    `store-register:${store.id}:${ip}`,
    10,
    600
  )
  if (!limit.allowed) return { error: errors.tooManyAttemptsLater }

  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: issueMessage(parsed.error.issues[0], text) }
  }

  const [firstName, ...rest] = parsed.data.name.split(/\s+/)
  try {
    const { customerId, token } = await registerCustomer(store.organizationId, {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      firstName,
      lastName: rest.join(' ') || undefined,
      phone: parsed.data.phone,
    })
    await startSession(store.organizationId, customerId, token)
  } catch (cause) {
    return {
      error:
        text.language === 'en' && cause instanceof Error
          ? cause.message
          : errors.couldNotCreateAccount,
    }
  }
  return { ok: true, redirect: safeNextPath(formData.get('next')) }
}

export async function loginAction(
  _prev: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const store = await requestStore()
  if (!store) {
    return { error: DEFAULT_STORE_TEXT.words.errors.accountsUnavailable }
  }
  const text = storeText(store.theme)
  const errors = text.words.errors

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: issueMessage(parsed.error.issues[0], text) }
  }
  const email = parsed.data.email.toLowerCase()

  const ip = await getClientIp()
  const [perIp, perAccount] = await Promise.all([
    checkRateLimit(`store-login:${store.id}:${ip}`, 20, 600),
    checkRateLimit(`store-login:${store.id}:${email}`, 8, 600),
  ])
  if (!perIp.allowed || !perAccount.allowed) {
    return { error: errors.tooManyAttemptsMinutes }
  }

  try {
    const { customerId, token } = await authenticateCustomer(
      store.organizationId,
      email,
      parsed.data.password
    )
    await startSession(store.organizationId, customerId, token)
  } catch {
    return { error: errors.wrongLogin }
  }
  return { ok: true, redirect: safeNextPath(formData.get('next')) }
}

/**
 * A form's first validation problem in the shop's language. English keeps the
 * schema's own wording; other languages are matched by field.
 */
function issueMessage(
  issue: { message: string; path: PropertyKey[]; code: string } | undefined,
  text: StoreText
): string {
  const errors = text.words.errors
  if (!issue) return errors.checkDetails
  if (text.language === 'en') return issue.message
  switch (issue.path[0]) {
    case 'name':
      return errors.enterName
    case 'email':
      return errors.validEmail
    case 'password':
      return issue.code === 'too_small' && issue.message.includes('8')
        ? errors.passwordLength
        : errors.enterPassword
    default:
      return errors.checkDetails
  }
}

export async function logoutAction(): Promise<{ redirect: string }> {
  const jar = await cookies()
  const token = jar.get(CUSTOMER_SESSION_COOKIE)?.value
  if (token) await logoutCustomer(token)
  jar.delete(CUSTOMER_SESSION_COOKIE)
  return { redirect: '/' }
}
