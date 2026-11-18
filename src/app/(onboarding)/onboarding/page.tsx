import { redirect } from 'next/navigation'
import { prisma } from '@/server/db/client'
import { getActiveOrganization } from '@/server/services/organizationService'
import { requireVerifiedEmail } from '@/server/auth/emailGate'
import { getEntitlements } from '@/server/services/entitlementService'
import {
  listSelectablePlans,
  trialEligibility,
} from '@/server/services/planCheckoutService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { emailStepRequired } from '@/server/onboarding'
import {
  FEATURED_BADGE,
  FEATURED_CODE,
  cardLines,
  toPublicPackage,
  yearlySaving,
} from '@/components/marketing/site/packages'
import { signupSteps } from '@/lib/onboarding'
import { OnboardingFlow, type OnboardingPackage } from './OnboardingFlow'

export const metadata = { title: 'Set up your workspace' }

/**
 * The second half of signing up, for someone starting their own workspace:
 * their business, then a package on its free trial, then their first site.
 * Reached from sign-up, and from the dashboard for any owner whose workspace
 * has never had a package (see the dashboard layout).
 */
export default async function OnboardingPage() {
  const { session, organization, role } = await getActiveOrganization()
  await requireVerifiedEmail(session.user.id)
  if (role !== 'OWNER') redirect('/dashboard')

  const [user, entitlements, plans, selfServe, withEmail] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, onboardedAt: true, signupPurpose: true },
    }),
    getEntitlements(organization.id),
    listSelectablePlans(),
    getPlatformFlag('billing.selfServeUpgrades'),
    emailStepRequired(),
  ])

  const { access } = entitlements
  const noPlan = access.state === 'RESTRICTED' && access.reason === 'NO_PLAN'
  if (user?.onboardedAt && !noPlan) redirect('/dashboard')

  const eligibility = noPlan
    ? await trialEligibility(organization.id, session.user.id)
    : null

  // The workspace is named "<name>'s Workspace" at signup; that is not a
  // business name worth offering back.
  const generatedName =
    organization.name.endsWith('’s Workspace') ||
    organization.name.endsWith("'s Workspace")
  const businessName = generatedName ? '' : organization.name

  const packages: OnboardingPackage[] = plans
    .filter((plan) => !plan.isContactSalesOnly)
    .map((plan) => {
      const pkg = toPublicPackage(plan)
      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        tagline: plan.tagline,
        monthlyPriceCents: plan.monthlyPriceCents,
        annualPriceCents: plan.annualPriceCents,
        trialDays: plan.trialDays,
        yearlySaving: yearlySaving(pkg),
        lines: cardLines(pkg).slice(0, 4),
        badge: plan.code === FEATURED_CODE ? FEATURED_BADGE : null,
      }
    })

  // Back on this page after saving the business: carry on at the package.
  const businessDone = Boolean(businessName && user?.signupPurpose)

  return (
    <OnboardingFlow
      firstName={user?.name?.split(' ')[0] ?? null}
      steps={signupSteps(withEmail)}
      initialStep={!noPlan ? 'business' : businessDone ? 'package' : 'business'}
      needsPackage={noPlan}
      business={{
        name: businessName,
        purpose: user?.signupPurpose ?? null,
      }}
      packages={packages}
      featuredCode={FEATURED_CODE}
      trial={{
        selfServe,
        eligible: eligibility?.eligible ?? true,
        reason: eligibility?.reason ?? null,
      }}
      current={
        noPlan
          ? null
          : {
              planName: entitlements.planName,
              endsAt:
                access.state === 'OK'
                  ? (access.endsAt?.toISOString() ?? null)
                  : null,
            }
      }
    />
  )
}
