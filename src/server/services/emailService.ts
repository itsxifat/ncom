import 'server-only'
import nodemailer from 'nodemailer'
import { prisma } from '@/server/db/client'
import type { EmailPurpose, EmailStatus } from '@/generated/prisma/enums'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

/**
 * Outbound email.
 *
 * SMTP credentials live in the database, edited from /admin/email, rather than
 * in environment variables — the platform owner has to be able to point the
 * OTP sender at a different provider on a Sunday without a redeploy.
 *
 * One server per purpose, with DEFAULT as the fallback. That split exists for a
 * real operational reason: bulk marketing mail and verification codes have
 * opposite requirements. Marketing gets throttled and complained about;
 * verification has to arrive in seconds. Sending both from one server means one
 * unsubscribe complaint can delay every signup on the platform.
 *
 * Passwords are encrypted with lib/crypto (AES-256-GCM, key derived from
 * AUTH_SECRET) and never leave the server. The admin UI receives a mask.
 */

export interface SmtpConfigView {
  id: string
  purpose: EmailPurpose
  label: string | null
  isEnabled: boolean
  host: string
  port: number
  encryption: 'NONE' | 'STARTTLS' | 'SSL_TLS'
  username: string
  /** Whether a password is stored, as a mask. Never the secret, never part of it. */
  passwordPreview: string | null
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  lastTestAt: Date | null
  lastTestOk: boolean | null
  lastTestError: string | null
  updatedAt: Date
}

export interface SmtpConfigInput {
  purpose: EmailPurpose
  label?: string | null
  isEnabled: boolean
  host: string
  port: number
  encryption: 'NONE' | 'STARTTLS' | 'SSL_TLS'
  username: string
  /**
   * Omit or leave empty to keep the stored password. A form that always sent
   * the field would wipe the secret every time an admin edited the port.
   */
  password?: string | null
  fromName: string
  fromEmail: string
  replyToEmail?: string | null
}

// ── Configuration ─────────────────────────────────────────────────────────

export async function listSmtpConfigs(): Promise<SmtpConfigView[]> {
  const rows = await prisma.emailSmtpConfig.findMany({
    orderBy: { purpose: 'asc' },
  })

  return rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    label: row.label,
    isEnabled: row.isEnabled,
    host: row.host,
    port: row.port,
    encryption: row.encryption,
    username: row.username,
    passwordPreview: previewPassword(row.passwordEncrypted),
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    replyToEmail: row.replyToEmail,
    lastTestAt: row.lastTestAt,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
    updatedAt: row.updatedAt,
  }))
}

/**
 * Whether a password is stored — and nothing more about it.
 *
 * Not `maskSecret`, which keeps the last four characters. That is the right
 * trade-off for an API key, where the tail is how you tell two keys apart and the
 * key is long enough that four characters reveal little. A mail password is
 * typically short and human-chosen, so a tail is a meaningful fraction of it, and
 * an admin never needs to identify one password among several — there is only
 * ever one per purpose.
 *
 * Still decrypts, because failing to (a rotated AUTH_SECRET, a corrupted row) is
 * worth surfacing: the stored password is unusable and every send will fail.
 */
function previewPassword(encrypted: string | null): string | null {
  if (!encrypted) return null
  try {
    decryptSecret(encrypted)
    return '•••••••••••• (set)'
  } catch {
    return '•••••••• (unreadable — re-enter it)'
  }
}

export async function upsertSmtpConfig(input: SmtpConfigInput): Promise<void> {
  const shared = {
    label: input.label?.trim() || null,
    isEnabled: input.isEnabled,
    host: input.host.trim(),
    port: input.port,
    encryption: input.encryption,
    username: input.username.trim(),
    fromName: input.fromName.trim(),
    fromEmail: input.fromEmail.trim().toLowerCase(),
    replyToEmail: input.replyToEmail?.trim().toLowerCase() || null,
  }

  const password = input.password?.trim()

  await prisma.emailSmtpConfig.upsert({
    where: { purpose: input.purpose },
    create: {
      purpose: input.purpose,
      ...shared,
      passwordEncrypted: password ? encryptSecret(password) : null,
    },
    update: {
      ...shared,
      // Only overwrite when a new password was actually typed.
      ...(password ? { passwordEncrypted: encryptSecret(password) } : {}),
    },
  })
}

export async function deleteSmtpConfig(purpose: EmailPurpose): Promise<void> {
  await prisma.emailSmtpConfig.delete({ where: { purpose } })
}

/**
 * The server a purpose should send through: its own row, else DEFAULT.
 *
 * A disabled row is not skipped over to the fallback — disabling
 * EMAIL_VERIFICATION means "stop sending verification mail", not "send it
 * through the marketing server instead".
 */
async function resolveConfig(purpose: EmailPurpose) {
  const own = await prisma.emailSmtpConfig.findUnique({ where: { purpose } })
  if (own) return own.isEnabled ? own : null

  if (purpose === 'DEFAULT') return null

  const fallback = await prisma.emailSmtpConfig.findUnique({
    where: { purpose: 'DEFAULT' },
  })
  return fallback?.isEnabled ? fallback : null
}

/** Whether anything at all can be sent for a purpose — for gating UI copy. */
export async function isEmailConfigured(
  purpose: EmailPurpose
): Promise<boolean> {
  return (await resolveConfig(purpose)) !== null
}

// ── Sending ───────────────────────────────────────────────────────────────

export interface SendEmailInput {
  purpose: EmailPurpose
  to: string
  subject: string
  html: string
  text: string
}

export interface SendResult {
  status: EmailStatus
  error?: string
}

function buildTransport(config: {
  host: string
  port: number
  encryption: 'NONE' | 'STARTTLS' | 'SSL_TLS'
  username: string
  passwordEncrypted: string | null
}) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // `secure` means "TLS from the first byte", which is port 465. STARTTLS
    // upgrades a plaintext connection instead, so it is secure: false plus
    // requireTLS — setting `secure` for a STARTTLS server hangs the handshake.
    secure: config.encryption === 'SSL_TLS',
    requireTLS: config.encryption === 'STARTTLS',
    auth: config.username
      ? {
          user: config.username,
          pass: config.passwordEncrypted
            ? decryptSecret(config.passwordEncrypted)
            : '',
        }
      : undefined,
    // A stuck SMTP dialogue must not hold a server action open indefinitely;
    // the caller gets a failure it can report instead of a hanging request.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

/**
 * Sends one message, recording the attempt.
 *
 * Never throws. Callers that must react to failure read the returned status —
 * see `sendEmailOrThrow` for the OTP path, where silence would leave someone
 * waiting for a code that is never coming.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const config = await resolveConfig(input.purpose)

  if (!config) {
    await logEmail(
      input,
      'SKIPPED',
      'No SMTP server configured for this purpose'
    )
    return { status: 'SKIPPED', error: 'No SMTP server configured' }
  }

  try {
    const transport = buildTransport(config)
    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      replyTo: config.replyToEmail ?? undefined,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
    transport.close()

    await logEmail(input, 'SENT', null, config.host)
    return { status: 'SENT' }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown SMTP error'
    console.error(
      `Email send failed (${input.purpose} -> ${input.to}):`,
      message
    )
    await logEmail(input, 'FAILED', message, config.host)
    return { status: 'FAILED', error: message }
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

/** For flows that are pointless if the mail does not go out. */
export async function sendEmailOrThrow(input: SendEmailInput): Promise<void> {
  const result = await sendEmail(input)
  if (result.status !== 'SENT') {
    throw new EmailDeliveryError(
      result.status === 'SKIPPED'
        ? 'Email is not configured on this platform yet. Contact support.'
        : `Could not send email: ${result.error}`
    )
  }
}

/**
 * Strips anything secret out of a subject line before it is stored.
 *
 * One-time codes are put in the subject deliberately — it is what lets someone
 * read the code from a notification without opening the mail. But EmailLog is
 * read by support, and a log that shows the code defeats the point of sending it
 * to an address only the owner controls: within the code's ten-minute life,
 * anyone with admin or database read could complete someone else's verification.
 *
 * So the digits go, and only for the purposes that carry codes — a billing
 * subject naming an amount, or an order number, is not a secret and is useful.
 */
function redactSubject(purpose: EmailPurpose, subject: string): string {
  if (purpose !== 'EMAIL_VERIFICATION' && purpose !== 'PASSWORD_RESET') {
    return subject
  }
  // Any run of four or more digits. Codes are six; this also catches a future
  // change in length without needing to be updated.
  return subject.replace(/\d{4,}/g, '••••••')
}

async function logEmail(
  input: SendEmailInput,
  status: EmailStatus,
  error: string | null,
  smtpHost?: string
): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        purpose: input.purpose,
        toEmail: input.to,
        subject: redactSubject(input.purpose, input.subject),
        status,
        error,
        smtpHost: smtpHost ?? null,
      },
    })
  } catch (logError) {
    // Logging is observability, not the job. A full disk must not swallow a
    // verification email that otherwise went out fine.
    console.error('Failed to write email log:', logError)
  }
}

/**
 * Verifies a stored configuration end to end by sending to `recipient`.
 *
 * The result is written back onto the config row so a broken server is visible
 * in the admin list rather than only in the logs.
 */
export async function sendTestEmail(
  purpose: EmailPurpose,
  recipient: string
): Promise<SendResult> {
  const result = await sendEmail({
    purpose,
    to: recipient,
    subject: `NCOM SMTP test (${purpose})`,
    text: `This is a test message from NCOM for the ${purpose} mail server. If you received it, the configuration works.`,
    html: `<p>This is a test message from NCOM for the <strong>${purpose}</strong> mail server.</p><p>If you received it, the configuration works.</p>`,
  })

  await prisma.emailSmtpConfig
    .update({
      where: { purpose },
      data: {
        lastTestAt: new Date(),
        lastTestOk: result.status === 'SENT',
        lastTestError: result.error ?? null,
      },
    })
    .catch(() => {
      // Testing a purpose with no row of its own (it fell back to DEFAULT)
      // has nothing to write back to. The send result still stands.
    })

  return result
}

export async function listEmailLog(limit = 100) {
  return prisma.emailLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
