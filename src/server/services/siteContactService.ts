import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'

/**
 * How people reach NCOM — the details the public site shows (footer, Contact
 * page, the Enterprise package, the legal pages), set by a platform admin in
 * /admin/settings rather than written into the pages.
 *
 * Stored as one JSON row in PlatformSetting. A field left empty is simply not
 * shown anywhere: the site never prints a placeholder to a visitor.
 */

const KEY = 'site.contact'

const trimmed = z.string().trim().max(300)

export const siteContactSchema = z.object({
  /** The legal name the Terms and Privacy pages are written in. */
  businessName: trimmed.min(1, 'Add the business name.').max(120),
  supportEmail: z.union([
    z.literal(''),
    z.string().trim().email('That email address does not look right.'),
  ]),
  /** WhatsApp number with country code, e.g. 8801XXXXXXXXX. */
  whatsapp: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d+]/g, ''))
    .refine((value) => value === '' || /^\+?\d{8,15}$/.test(value), {
      message:
        'Write the WhatsApp number with its country code, e.g. 8801XXXXXXXXX.',
    }),
  phone: trimmed.max(40),
  facebookUrl: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .url('Paste the full Facebook page link, starting with https://')
      .refine((value) => value.startsWith('https://'), 'Use an https:// link.'),
  ]),
  address: trimmed,
  /** When someone answers, in words: "Sat–Thu, 10am–8pm". */
  hours: trimmed.max(120),
})

export type SiteContact = z.infer<typeof siteContactSchema>

const DEFAULTS: SiteContact = {
  businessName: 'Enfinito',
  supportEmail: '',
  whatsapp: '',
  phone: '',
  facebookUrl: '',
  address: '',
  hours: '',
}

/** The site's contact details, with every missing field empty. Cached per request. */
export const getSiteContact = cache(async (): Promise<SiteContact> => {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } })
  const stored =
    row && typeof row.value === 'object' && row.value !== null
      ? (row.value as Partial<SiteContact>)
      : {}
  const merged = { ...DEFAULTS }
  for (const field of Object.keys(DEFAULTS) as (keyof SiteContact)[]) {
    const value = stored[field]
    if (typeof value === 'string') merged[field] = value
  }
  return merged
})

/** Saves the contact details. The caller checks the platform admin. */
export async function saveSiteContact(input: SiteContact): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: input as unknown as Prisma.InputJsonValue },
    update: { value: input as unknown as Prisma.InputJsonValue },
  })
}

/** wa.me link for a WhatsApp number, or null when there is none. */
export function whatsappLink(number: string): string | null {
  const digits = number.replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : null
}

/** "8801712345678" → "+880 1712-345678"; other numbers as written. */
export function displayPhone(number: string): string {
  const digits = number.replace(/\D/g, '')
  const bd = digits.match(/^(880)(1\d{3})(\d{6})$/)
  return bd ? `+${bd[1]} ${bd[2]}-${bd[3]}` : number
}
