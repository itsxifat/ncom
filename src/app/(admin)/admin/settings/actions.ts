'use server'

import { revalidatePath } from 'next/cache'
import {
  upsertPlatformSetting,
  deletePlatformSetting,
} from '@/server/services/adminService'
import { upsertPlatformSettingSchema } from '@/lib/validation/platform-setting'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { logAudit } from '@/server/services/auditService'
import {
  PLATFORM_FLAG_KEYS,
  setPlatformFlag,
  type PlatformFlagKey,
} from '@/server/services/platformFlagService'
import {
  saveSiteContact,
  siteContactSchema,
} from '@/server/services/siteContactService'

export type SettingFormState = { error?: string } | undefined

export async function upsertPlatformSettingAction(
  _prevState: SettingFormState,
  formData: FormData
): Promise<SettingFormState> {
  const parsed = upsertPlatformSettingSchema.safeParse({
    key: formData.get('key'),
    value: formData.get('value'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  let value: unknown
  try {
    value = JSON.parse(parsed.data.value)
  } catch {
    return { error: 'Value must be valid JSON (e.g. "text", 123, true, {})' }
  }

  await upsertPlatformSetting(parsed.data.key, value)
  revalidatePath('/admin/settings')
  return { error: undefined }
}

export async function deletePlatformSettingAction(key: string) {
  await deletePlatformSetting(key)
  revalidatePath('/admin/settings')
}

/**
 * Flips one named platform switch.
 *
 * Separate from the raw key/value editor above because these keys are declared
 * in `PLATFORM_FLAGS` and read by code — a typo in the raw editor silently
 * creates a setting nothing reads, which looks like the switch not working.
 */
export async function setPlatformFlagAction(
  key: PlatformFlagKey,
  value: boolean
): Promise<{ error?: string }> {
  const session = await requirePlatformAdmin()

  if (!PLATFORM_FLAG_KEYS.includes(key)) {
    return { error: 'Unknown setting.' }
  }

  await setPlatformFlag(key, value)
  await logAudit(session.user.id, 'platform.flag.set', 'PlatformSetting', key, {
    value,
  })

  // Several flags change what the auth pages render, so the whole tree is
  // revalidated rather than just this one route.
  revalidatePath('/', 'layout')
  return {}
}

export type SiteContactFormState =
  { error?: string; saved?: boolean } | undefined

/**
 * Saves how people reach NCOM — shown in the public site's footer, on the
 * Contact page, on the Enterprise package and in the legal pages. An empty
 * field is left off the site.
 */
export async function saveSiteContactAction(
  _prevState: SiteContactFormState,
  formData: FormData
): Promise<SiteContactFormState> {
  const session = await requirePlatformAdmin()

  const parsed = siteContactSchema.safeParse({
    businessName: formData.get('businessName') ?? '',
    supportEmail: formData.get('supportEmail') ?? '',
    whatsapp: formData.get('whatsapp') ?? '',
    phone: formData.get('phone') ?? '',
    facebookUrl: formData.get('facebookUrl') ?? '',
    address: formData.get('address') ?? '',
    hours: formData.get('hours') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details.' }
  }

  await saveSiteContact(parsed.data)
  await logAudit(
    session.user.id,
    'platform.site_contact.updated',
    'PlatformSetting',
    'site.contact'
  )
  // The footer is on every public page.
  revalidatePath('/', 'layout')
  return { saved: true }
}
