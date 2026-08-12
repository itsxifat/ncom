import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db/client'

/**
 * Named platform switches, stored in the existing PlatformSetting key/value
 * table but reached through a typed accessor.
 *
 * The raw key/value editor stays (an escape hatch for one-off values), but the
 * switches that change how authentication and enforcement behave are declared
 * here so they can be rendered as a real form with labels and defaults, and so a
 * typo in a key name cannot silently disable email verification.
 *
 * Defaults matter: a fresh install has no rows at all, and every flag's default
 * is the safe reading — verification on, self-serve upgrades on, quota
 * enforcement on.
 */

export const PLATFORM_FLAGS = {
  'auth.requireEmailVerification': {
    label: 'Require email verification',
    description:
      'New accounts must confirm their address with an emailed code before reaching the dashboard. Google sign-ins are already verified by Google and skip this.',
    default: true,
    group: 'Authentication',
  },
  'auth.googleLoginEnabled': {
    label: 'Allow Google sign-in',
    description:
      'Shows the "Continue with Google" button. Has no effect unless AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set in the environment.',
    default: true,
    group: 'Authentication',
  },
  'auth.allowSelfRegistration': {
    label: 'Allow public sign-ups',
    description:
      'Turn off to close registration — existing tenants keep working and only invited users can join.',
    default: true,
    group: 'Authentication',
  },
  'billing.selfServeUpgrades': {
    label: 'Allow self-serve plan changes',
    description:
      'Tenants can change their own plan from Billing. Turn off to route every change through your team.',
    default: true,
    group: 'Billing',
  },
  'billing.showPaymentStep': {
    label: 'Show the payment step at checkout',
    description:
      'Displays the payment section on checkout. While no gateway is connected it explains that online payment is not open yet — orders over ৳0 are recorded for your team to complete.',
    default: true,
    group: 'Billing',
  },
  'billing.couponsEnabled': {
    label: 'Accept coupon codes',
    description: 'Shows the coupon field at checkout and honours codes.',
    default: true,
    group: 'Billing',
  },
  'quota.enforceGlobally': {
    label: 'Enforce plan limits',
    description:
      'Master switch. Off means every quota check passes — for use during a migration or an incident, not as a permanent setting.',
    default: true,
    group: 'Limits',
  },
  'quota.enforcePublicTrafficCap': {
    label: 'Pause sites over their traffic allowance',
    description:
      'Public sites of tenants past their monthly bandwidth return a "temporarily unavailable" page until the allowance resets. Plans opt in individually as well.',
    default: true,
    group: 'Limits',
  },
  'domains.verificationEnabled': {
    label: 'Allow custom domains',
    description:
      'Lets tenants add and verify their own domains, within their plan limit.',
    default: true,
    group: 'Domains',
  },
} as const satisfies Record<
  string,
  { label: string; description: string; default: boolean; group: string }
>

export type PlatformFlagKey = keyof typeof PLATFORM_FLAGS

export const PLATFORM_FLAG_KEYS = Object.keys(
  PLATFORM_FLAGS
) as PlatformFlagKey[]

/**
 * All flags in one read, cached per request.
 *
 * Loading every flag rather than one at a time because several are read on the
 * same request (checkout reads three) and the whole table is a handful of rows.
 */
export const getPlatformFlags = cache(
  async (): Promise<Record<PlatformFlagKey, boolean>> => {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: PLATFORM_FLAG_KEYS } },
    })

    const stored = new Map(rows.map((row) => [row.key, row.value]))

    return Object.fromEntries(
      PLATFORM_FLAG_KEYS.map((key) => {
        const raw = stored.get(key)
        // Anything that is not an explicit boolean falls back to the default:
        // a hand-edited row containing a string must not read as truthy.
        return [
          key,
          typeof raw === 'boolean' ? raw : PLATFORM_FLAGS[key].default,
        ]
      })
    ) as Record<PlatformFlagKey, boolean>
  }
)

export async function getPlatformFlag(key: PlatformFlagKey): Promise<boolean> {
  return (await getPlatformFlags())[key]
}

export async function setPlatformFlag(
  key: PlatformFlagKey,
  value: boolean
): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}
