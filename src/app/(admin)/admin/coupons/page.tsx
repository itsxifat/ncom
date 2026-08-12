import Link from 'next/link'
import { Plus, TicketPercent } from 'lucide-react'
import {
  listCouponsForAdmin,
  listPlansForAdmin,
} from '@/server/services/planAdminService'
import { describeCoupon } from '@/server/services/planCouponService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CouponRowActions } from './CouponRowActions'

export const metadata = { title: 'Coupons' }

/** The rules an operator most needs to see without opening the coupon. */
function ruleSummary(coupon: {
  existingCustomersOnly: boolean
  newOrganizationsOnly: boolean
  firstPurchaseOnly: boolean
  appliesToAllPlans: boolean
  plans: { planId: string }[]
  restrictedToEmails: string[]
  restrictedToOrganizationIds: string[]
  restrictedToEmailDomain: string | null
  minTermMonths: number | null
}): string[] {
  const rules: string[] = []
  if (coupon.existingCustomersOnly) rules.push('existing customers')
  if (coupon.newOrganizationsOnly) rules.push('first-time subscribers')
  if (coupon.firstPurchaseOnly) rules.push('first checkout')
  if (!coupon.appliesToAllPlans) rules.push(`${coupon.plans.length} plans`)
  if (coupon.restrictedToEmails.length > 0) rules.push('email list')
  if (coupon.restrictedToOrganizationIds.length > 0)
    rules.push('workspace list')
  if (coupon.restrictedToEmailDomain)
    rules.push(`@${coupon.restrictedToEmailDomain}`)
  if (coupon.minTermMonths) rules.push(`${coupon.minTermMonths}+ months`)
  return rules
}

export default async function AdminCouponsPage() {
  const [coupons, plans] = await Promise.all([
    listCouponsForAdmin(),
    listPlansForAdmin(),
  ])

  const now = new Date()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="Coupons"
        description="Discount codes for plans and add-ons. A 100%-off code is how a tenant gets full access without a payment gateway."
        actions={
          <Button
            render={<Link href="/admin/coupons/new" />}
            nativeButton={false}
          >
            <Plus />
            New coupon
          </Button>
        }
      />

      {coupons.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No coupons"
          description="Create a code to give a workspace a discount — or a plan for free."
          action={
            <Button
              render={<Link href="/admin/coupons/new" />}
              nativeButton={false}
            >
              <Plus />
              New coupon
            </Button>
          }
        />
      ) : (
        <ListPanel>
          {coupons.map((coupon) => {
            const expired = coupon.endsAt !== null && coupon.endsAt < now
            const notStarted = coupon.startsAt !== null && coupon.startsAt > now
            const exhausted =
              coupon.maxRedemptions !== null &&
              coupon.redeemedCount >= coupon.maxRedemptions
            const rules = ruleSummary(coupon)

            return (
              <ListRow key={coupon.id}>
                <ListRowText
                  title={
                    <Link
                      href={`/admin/coupons/${coupon.id}`}
                      className="font-mono hover:underline"
                    >
                      {coupon.code}
                    </Link>
                  }
                  meta={
                    <>
                      {describeCoupon(coupon)}
                      {rules.length > 0 && ` · ${rules.join(', ')}`}
                      {' · '}
                      {coupon._count.redemptions} used
                      {coupon.maxRedemptions !== null &&
                        ` of ${coupon.maxRedemptions}`}
                    </>
                  }
                  badges={
                    <>
                      {!coupon.isActive && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                      {expired && <Badge variant="outline">Expired</Badge>}
                      {notStarted && <Badge variant="outline">Scheduled</Badge>}
                      {exhausted && (
                        <Badge variant="outline">Fully redeemed</Badge>
                      )}
                      {coupon.isActive &&
                        !expired &&
                        !notStarted &&
                        !exhausted && <Badge variant="secondary">Live</Badge>}
                    </>
                  }
                />
                <ListRowActions>
                  <CouponRowActions couponId={coupon.id} code={coupon.code} />
                </ListRowActions>
              </ListRow>
            )
          })}
        </ListPanel>
      )}

      <p className="text-muted-foreground text-xs">
        {plans.length} plan{plans.length === 1 ? '' : 's'} available to target.
      </p>
    </div>
  )
}
