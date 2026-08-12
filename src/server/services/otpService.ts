import 'server-only'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/server/db/client'
import type { OtpPurpose } from '@/generated/prisma/enums'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendEmailOrThrow } from '@/server/services/emailService'
import {
  passwordResetCodeEmail,
  verificationCodeEmail,
} from '@/server/email/templates'

/**
 * One-time codes for proving control of an email address.
 *
 * Six digits, ten minutes, five attempts. That combination is what makes the
 * short code safe: 10^6 possibilities is trivially brute-forceable given
 * unlimited guesses, so the attempt counter — not the code length — is the
 * actual control. Both the per-code counter and a per-address rate limit are
 * enforced, because an attacker can otherwise request a fresh code after every
 * fifth guess and get unlimited attempts that way.
 *
 * Codes are stored as SHA-256 hashes. Unlike a password there is no need for a
 * slow KDF: the value is high-entropy relative to its ten-minute life and dies
 * after five guesses, so bcrypt would only add latency to every signup.
 */

const CODE_LENGTH = 6
const TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

/** Codes issued per address per hour, across all purposes. */
const MAX_SENDS_PER_HOUR = 5

export class OtpError extends Error {
  readonly code:
    'RATE_LIMITED' | 'NOT_FOUND' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'INVALID'

  constructor(code: OtpError['code'], message: string) {
    super(message)
    this.name = 'OtpError'
    this.code = code
  }
}

/**
 * A cryptographically random 6-digit code.
 *
 * `randomInt` rather than `Math.random()`: predictable codes would let anyone
 * who knows the issuing time verify someone else's address. The range starts at
 * 100000 so every code is exactly six digits — a leading zero silently dropped
 * by a numeric input is a support call.
 */
function generateCode(): string {
  return String(randomInt(100_000, 1_000_000))
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface IssueOtpResult {
  expiresAt: Date
  /** Present only outside production, so local dev needs no mail server. */
  devCode?: string
}

/**
 * Issues a code and emails it.
 *
 * Any unconsumed code for the same address and purpose is invalidated first:
 * two live codes means the older one is still a valid secret sitting in an inbox
 * after the user asked for a replacement.
 */
export async function issueOtp(input: {
  email: string
  purpose: OtpPurpose
  userId?: string | null
}): Promise<IssueOtpResult> {
  const email = normalizeEmail(input.email)

  const limit = await checkRateLimit(
    `otp:${email}`,
    MAX_SENDS_PER_HOUR,
    60 * 60
  )
  if (!limit.allowed) {
    throw new OtpError(
      'RATE_LIMITED',
      'Too many codes requested. Try again in a little while.'
    )
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000)

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationCode.updateMany({
      where: { email, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    })

    await tx.emailVerificationCode.create({
      data: {
        email,
        purpose: input.purpose,
        userId: input.userId ?? null,
        codeHash: hashCode(code),
        expiresAt,
      },
    })
  })

  const rendered =
    input.purpose === 'PASSWORD_RESET'
      ? passwordResetCodeEmail({ code, expiresInMinutes: TTL_MINUTES })
      : verificationCodeEmail({ code, expiresInMinutes: TTL_MINUTES })

  // Throws if the mail could not be sent: a code the user cannot receive is
  // worse than a visible error, because they will sit on the verify screen
  // waiting for it.
  await sendEmailOrThrow({
    purpose:
      input.purpose === 'PASSWORD_RESET'
        ? 'PASSWORD_RESET'
        : 'EMAIL_VERIFICATION',
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })

  return {
    expiresAt,
    // Local development typically has no SMTP server configured at all. Rather
    // than making signup untestable, the code is returned (and logged) outside
    // production only. Guarded on NODE_ENV, so a production build cannot leak
    // it even if a caller forwards the field.
    ...(process.env.NODE_ENV === 'production' ? {} : { devCode: code }),
  }
}

/**
 * Checks a code and consumes it on success.
 *
 * Returns the row so callers can act on `userId`/`email` — the register flow
 * needs to know which account to mark verified.
 */
export async function verifyOtp(input: {
  email: string
  purpose: OtpPurpose
  code: string
}): Promise<{ userId: string | null; email: string }> {
  const email = normalizeEmail(input.email)
  const submitted = input.code.trim()

  // Guessing is rate limited per address as well as per code: without this, an
  // attacker burns five attempts, triggers a resend, and repeats indefinitely.
  const limit = await checkRateLimit(`otp-verify:${email}`, 20, 60 * 60)
  if (!limit.allowed) {
    throw new OtpError('RATE_LIMITED', 'Too many attempts. Try again later.')
  }

  const record = await prisma.emailVerificationCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    throw new OtpError('NOT_FOUND', 'Request a new code to continue.')
  }
  if (record.expiresAt < new Date()) {
    throw new OtpError('EXPIRED', 'That code has expired. Request a new one.')
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw new OtpError(
      'TOO_MANY_ATTEMPTS',
      'Too many wrong attempts. Request a new code.'
    )
  }

  if (!codesMatch(record.codeHash, submitted)) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    const left = MAX_ATTEMPTS - (record.attempts + 1)
    throw new OtpError(
      'INVALID',
      left > 0
        ? `That code isn't right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
        : "That code isn't right. Request a new code."
    )
  }

  await prisma.emailVerificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  return { userId: record.userId, email: record.email }
}

/**
 * Constant-time comparison of the stored hash against a fresh hash of the
 * submission.
 *
 * Hashes are fixed-length hex, so `timingSafeEqual` will not throw on a length
 * mismatch — but comparing with `===` would leak, through response timing, how
 * many leading characters of the hash were correct. That is not directly the
 * code, but it is a distinguishing oracle and there is no reason to hand it out.
 */
function codesMatch(storedHash: string, submittedCode: string): boolean {
  const submittedHash = hashCode(submittedCode)
  const a = Buffer.from(storedHash, 'hex')
  const b = Buffer.from(submittedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** True when the address has a live, unconsumed code — for "resend in Ns" UI. */
export async function hasPendingCode(
  email: string,
  purpose: OtpPurpose
): Promise<boolean> {
  const count = await prisma.emailVerificationCode.count({
    where: {
      email: normalizeEmail(email),
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
  return count > 0
}

/**
 * Deletes expired codes. Nothing depends on them, and the table is on the
 * signup path so it should not grow without bound. Called opportunistically
 * from the admin overview rather than needing a scheduler.
 */
export async function pruneExpiredCodes(): Promise<number> {
  const result = await prisma.emailVerificationCode.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  return result.count
}

export const OTP_TTL_MINUTES = TTL_MINUTES
export const OTP_CODE_LENGTH = CODE_LENGTH
