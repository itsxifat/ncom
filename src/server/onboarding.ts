import 'server-only'
import { prisma } from '@/server/db/client'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { isEmailConfigured } from '@/server/services/emailService'
import type { BillingAccess } from '@/lib/billing-access'

/**
 * Whether signing up includes confirming the address: the platform has to
 * ask for it and be able to send the code (see registerAction's
 * `shouldVerify`, which lets people straight in otherwise).
 */
export async function emailStepRequired(): Promise<boolean> {
  if (!(await getPlatformFlag('auth.requireEmailVerification'))) return false
  return isEmailConfigured('EMAIL_VERIFICATION')
}

/**
 * Whether this person should be sent to /onboarding instead of the
 * dashboard: they own the workspace, it has never had a package, and they
 * have not been through onboarding. Anyone invited into someone else's
 * workspace, any workspace that already has a package, and the platform's
 * administrators are left alone.
 */
export async function shouldOnboard(input: {
  userId: string
  role: string
  platformRole: string | undefined
  access: BillingAccess
}): Promise<boolean> {
  if (input.role !== 'OWNER') return false
  if (input.platformRole === 'SUPER_ADMIN') return false
  if (input.access.state !== 'RESTRICTED' || input.access.reason !== 'NO_PLAN')
    return false
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { onboardedAt: true },
  })
  return !user?.onboardedAt
}
