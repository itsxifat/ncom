'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/server/db/client'
import {
  getActiveOrganization,
  updateOrganization,
} from '@/server/services/organizationService'
import { getEntitlements } from '@/server/services/entitlementService'
import {
  CheckoutError,
  startTrial,
} from '@/server/services/planCheckoutService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { onboardingBusinessSchema } from '@/lib/validation/auth'
import { safeCallbackPath } from '@/lib/auth-redirect'

export type OnboardingResult = {
  error?: string
  planName?: string
  trialEndsAt?: string
}

/** Marks this person as having been through onboarding, once. */
async function markOnboarded(userId: string) {
  await prisma.user.updateMany({
    where: { id: userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  })
}

/**
 * The business step: names the workspace after the business and records
 * where the seller is starting from. A workspace that already has a package
 * (an administrator's default) skips the package step, so for it this is
 * the end of onboarding.
 */
export async function saveBusinessAction(input: {
  businessName: string
  category?: string
  purpose: string
}): Promise<OnboardingResult> {
  const { session, organization, role } = await getActiveOrganization()
  if (role !== 'OWNER') {
    return { error: 'Only the workspace owner can set this up.' }
  }

  const parsed = onboardingBusinessSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details.' }
  }

  try {
    if (organization.name !== parsed.data.businessName) {
      // A workspace with no package yet is locked to everything but paying;
      // naming it is part of getting it to that point, so it is let through.
      await updateOrganization(
        organization.id,
        { name: parsed.data.businessName },
        { allowRestricted: true }
      )
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { signupPurpose: parsed.data.purpose },
    })
  } catch (error) {
    // A step that throws would drop the seller on the error page mid-setup.
    console.error('Onboarding could not save the business:', error)
    return { error: 'Could not save that just now. Try again in a moment.' }
  }

  const { access } = await getEntitlements(organization.id)
  if (!(access.state === 'RESTRICTED' && access.reason === 'NO_PLAN')) {
    await markOnboarded(session.user.id)
  }
  return {}
}

const trialSchema = z.object({
  planId: z.string().min(1),
  interval: z.enum(['MONTHLY', 'ANNUAL']),
})

/**
 * The package step: starts the chosen package on its free trial. Not
 * revalidated on purpose — the page would see a finished onboarding and send
 * the seller to the dashboard before they saw the last step.
 */
export async function startOnboardingTrialAction(input: {
  planId: string
  interval: 'MONTHLY' | 'ANNUAL'
}): Promise<OnboardingResult> {
  const { session, organization, role } = await getActiveOrganization()
  if (role !== 'OWNER') {
    return { error: 'Only the workspace owner can choose a package.' }
  }
  if (!(await getPlatformFlag('billing.selfServeUpgrades'))) {
    return {
      error:
        'Packages are set up by our team at the moment — get in touch and we will start your trial.',
    }
  }

  const parsed = trialSchema.safeParse(input)
  if (!parsed.success) return { error: 'Pick a package first.' }

  try {
    const { trialEndsAt, planName } = await startTrial({
      organizationId: organization.id,
      planId: parsed.data.planId,
      interval: parsed.data.interval,
    })
    await markOnboarded(session.user.id)
    return { planName, trialEndsAt: trialEndsAt.toISOString() }
  } catch (error) {
    // Only the checkout's own messages are written for people; anything else
    // is logged rather than shown.
    if (error instanceof CheckoutError) return { error: error.message }
    console.error('Onboarding could not start a trial:', error)
    return { error: 'Could not start the trial. Try again in a moment.' }
  }
}

/** Leaves onboarding for wherever the seller chose — Billing, usually. */
export async function finishOnboardingAction(formData: FormData) {
  const { session } = await getActiveOrganization()
  await markOnboarded(session.user.id)
  redirect(safeCallbackPath(formData.get('next'), '/dashboard'))
}
