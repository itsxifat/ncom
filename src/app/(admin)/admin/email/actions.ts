'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { smtpFormSchema } from '@/lib/validation/plan'
import type { EmailPurpose } from '@/generated/prisma/enums'
import {
  deleteSmtpConfig,
  sendTestEmail,
  upsertSmtpConfig,
} from '@/server/services/emailService'
import { logAudit } from '@/server/services/auditService'

export type SmtpFormState = { error?: string; notice?: string } | undefined

export async function saveSmtpConfigAction(
  _prevState: SmtpFormState,
  formData: FormData
): Promise<SmtpFormState> {
  const session = await requirePlatformAdmin()

  const parsed = smtpFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  )
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the fields.' }
  }

  try {
    await upsertSmtpConfig({
      ...parsed.data,
      replyToEmail: parsed.data.replyToEmail || null,
    })
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not save the mail server.',
    }
  }

  // The password is never logged, only the fact that it was changed.
  await logAudit(
    session.user.id,
    'email.smtp.saved',
    'EmailSmtpConfig',
    parsed.data.purpose,
    {
      host: parsed.data.host,
      passwordChanged: Boolean(parsed.data.password?.trim()),
    }
  )

  revalidatePath('/admin/email')
  return { notice: 'Saved. Send a test to confirm it works.' }
}

export async function deleteSmtpConfigAction(
  purpose: EmailPurpose
): Promise<{ error?: string }> {
  const session = await requirePlatformAdmin()

  try {
    await deleteSmtpConfig(purpose)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not remove it.',
    }
  }

  await logAudit(
    session.user.id,
    'email.smtp.deleted',
    'EmailSmtpConfig',
    purpose
  )
  revalidatePath('/admin/email')
  return {}
}

export async function sendTestEmailAction(
  purpose: EmailPurpose,
  recipient: string
): Promise<{ error?: string; notice?: string }> {
  await requirePlatformAdmin()

  const email = z.email().safeParse(recipient.trim())
  if (!email.success) return { error: 'Enter a valid email address.' }

  const result = await sendTestEmail(purpose, email.data)
  revalidatePath('/admin/email')

  if (result.status === 'SENT') {
    return { notice: `Test sent to ${email.data}.` }
  }
  return {
    error:
      result.status === 'SKIPPED'
        ? 'Nothing was sent — this purpose has no enabled server and no DEFAULT fallback.'
        : `Send failed: ${result.error}`,
  }
}
