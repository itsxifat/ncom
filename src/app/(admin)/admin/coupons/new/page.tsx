import { listPlansForAdmin } from '@/server/services/planAdminService'
import { PageHeader } from '@/components/app/page-header'
import { CouponForm } from '../CouponForm'

export const metadata = { title: 'New coupon' }

export default async function NewCouponPage() {
  const plans = await listPlansForAdmin()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Monetization"
        title="New coupon"
        description="Every rule you set has to pass before the code applies."
        backHref="/admin/coupons"
        backLabel="Coupons"
      />
      <CouponForm
        coupon={null}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
      />
    </div>
  )
}
