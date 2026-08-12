import { notFound } from 'next/navigation'
import {
  getCouponForAdmin,
  listCouponRedemptions,
  listPlansForAdmin,
} from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import { ListPanel, ListRow, ListRowText } from '@/components/app/list-panel'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
import { CouponForm, type CouponFormValues } from '../CouponForm'

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ couponId: string }>
}) {
  const { couponId } = await params

  const [coupon, plans, redemptions] = await Promise.all([
    getCouponForAdmin(couponId),
    listPlansForAdmin(),
    listCouponRedemptions(couponId),
  ])
  if (!coupon) notFound()

  // Dates become strings for the client boundary; the form's datetime inputs want
  // `YYYY-MM-DDTHH:mm` anyway.
  const values: CouponFormValues = {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    description: coupon.description,
    isActive: coupon.isActive,
    discountType: coupon.discountType,
    percentageBps: coupon.percentageBps,
    amountCents: coupon.amountCents,
    freeTrialDays: coupon.freeTrialDays,
    currencyCode: coupon.currencyCode,
    duration: coupon.duration,
    durationMonths: coupon.durationMonths,
    appliesToAllPlans: coupon.appliesToAllPlans,
    appliesToAddons: coupon.appliesToAddons,
    allowedIntervals: coupon.allowedIntervals,
    newOrganizationsOnly: coupon.newOrganizationsOnly,
    firstPurchaseOnly: coupon.firstPurchaseOnly,
    existingCustomersOnly: coupon.existingCustomersOnly,
    existingBeforeAt: coupon.existingBeforeAt?.toISOString() ?? null,
    minSubtotalCents: coupon.minSubtotalCents,
    minTermMonths: coupon.minTermMonths,
    requiresVerifiedEmail: coupon.requiresVerifiedEmail,
    restrictedToOrganizationIds: coupon.restrictedToOrganizationIds,
    restrictedToEmails: coupon.restrictedToEmails,
    restrictedToEmailDomain: coupon.restrictedToEmailDomain,
    maxRedemptions: coupon.maxRedemptions,
    maxRedemptionsPerOrg: coupon.maxRedemptionsPerOrg,
    redeemedCount: coupon.redeemedCount,
    startsAt: coupon.startsAt?.toISOString() ?? null,
    endsAt: coupon.endsAt?.toISOString() ?? null,
    isStackable: coupon.isStackable,
    planIds: coupon.plans.map((row) => row.planId),
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Monetization"
        title={coupon.code}
        description={coupon.name ?? 'Coupon rules and redemption history.'}
        backHref="/admin/coupons"
        backLabel="Coupons"
      />

      <CouponForm
        coupon={values}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
      />

      {redemptions.length > 0 && (
        <SettingsSection
          title="Redemptions"
          description={`${redemptions.length} recorded.`}
          bare
        >
          <ListPanel>
            {redemptions.map((redemption) => (
              <ListRow key={redemption.id}>
                <ListRowText
                  title={redemption.organization.name}
                  meta={redemption.redeemedAt.toLocaleString()}
                />
                <Money>
                  {formatMoney(redemption.discountCents, coupon.currencyCode)}{' '}
                  off
                </Money>
              </ListRow>
            ))}
          </ListPanel>
        </SettingsSection>
      )}
    </PageShell>
  )
}
