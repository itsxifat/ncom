import Link from 'next/link'
import { Plus, Ticket } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listDiscounts } from '@/server/services/discountService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { formatMoney, bpsToPercent } from '@/lib/money'
import { EmptyState } from '@/components/app/empty-state'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function DiscountsPage() {
  const { organization } = await getActiveOrganization()

  const [discounts, settings] = await Promise.all([
    listDiscounts(organization.id),
    getOrganizationSettings(organization.id),
  ])

  const currency = settings?.currencyCode ?? 'USD'
  const base = `/discounts`
  const now = new Date()

  if (discounts.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="No discounts yet"
        description="Create a code customers can enter at checkout, or a discount that applies automatically."
        action={
          <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
            <Plus />
            New discount
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button render={<Link href={`${base}/new`} />} nativeButton={false}>
          <Plus />
          New discount
        </Button>
      </div>

      <ListPanel>
        <ListPanelHeader>
          <p className="text-muted-foreground text-sm">
            {discounts.length}{' '}
            {discounts.length === 1 ? 'discount' : 'discounts'}
          </p>
        </ListPanelHeader>

        {discounts.map((discount) => {
          const value =
            discount.type === 'PERCENTAGE'
              ? `${bpsToPercent(discount.valueBps ?? 0)}% off`
              : discount.type === 'FIXED_AMOUNT'
                ? `${formatMoney(discount.valueCents ?? 0, currency)} off`
                : discount.type === 'FREE_SHIPPING'
                  ? 'Free shipping'
                  : `Buy ${discount.buyQuantity} get ${discount.getQuantity}`

          // "Active" is not just the flag — an expired or not-yet-started
          // discount is switched on but earns nothing, and showing it as
          // active is how merchants end up debugging a code that "does not
          // work".
          const expired = discount.endsAt !== null && discount.endsAt < now
          const scheduled = discount.startsAt > now
          const live = discount.isActive && !expired && !scheduled

          return (
            <ListRow key={discount.id}>
              <ListRowText
                title={
                  <Link
                    href={`${base}/${discount.id}`}
                    className="hover:underline"
                  >
                    {discount.title}
                  </Link>
                }
                meta={
                  <>
                    {value}
                    {discount.codes.length > 0 && (
                      <>
                        {' '}
                        · {discount.codes.map((code) => code.code).join(', ')}
                      </>
                    )}
                    {discount.usageLimit !== null && (
                      <>
                        {' '}
                        · {discount.usageCount}/{discount.usageLimit} used
                      </>
                    )}
                  </>
                }
                badges={
                  <Badge
                    variant={live ? 'lime' : expired ? 'outline' : 'secondary'}
                  >
                    {expired
                      ? 'Expired'
                      : scheduled
                        ? 'Scheduled'
                        : discount.isActive
                          ? 'Active'
                          : 'Paused'}
                  </Badge>
                }
              />
              <ListRowActions>
                <span className="text-muted-foreground text-sm">
                  {discount.usageCount} used
                </span>
              </ListRowActions>
            </ListRow>
          )
        })}
      </ListPanel>
    </div>
  )
}
