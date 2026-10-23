import Link from 'next/link'
import {
  listCreditOrdersForAdmin,
  listCreditPacksForAdmin,
} from '@/server/services/aiCreditService'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { SettingsSection } from '@/components/app/settings-section'
import {
  ListPanel,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
import { CreditPacksClient } from './CreditPacksClient'
import { CreditOrderActions } from './CreditOrderActions'

export const metadata = { title: 'AI credits' }

export default async function AdminAiCreditsPage() {
  const [packs, openOrders] = await Promise.all([
    listCreditPacksForAdmin(),
    listCreditOrdersForAdmin({ open: true }),
  ])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Monetization"
        title="AI credits"
        description="What workspaces pay for the AI builder with. Plans include monthly credits (edit a plan to set them); here are the packs they can buy, and the orders waiting for payment. To give credits to one workspace, open it under Subscriptions."
      />

      {openOrders.length > 0 && (
        <SettingsSection
          title="Waiting on payment"
          description="No gateway is connected, so a credit order waits here until you confirm the payment. Marking it paid adds the credits at once."
          bare
        >
          <ListPanel>
            {openOrders.map((order) => (
              <ListRow key={order.id}>
                <ListRowText
                  title={
                    <Link
                      href={`/admin/subscriptions/${order.organizationId}`}
                      className="hover:underline"
                    >
                      {order.organization.name}
                    </Link>
                  }
                  meta={`${order.packName} · ${order.credits.toLocaleString()} credits · ${order.createdAt.toLocaleDateString()}`}
                  badges={<Badge variant="outline">Awaiting payment</Badge>}
                />
                <ListRowActions>
                  <Money>
                    {formatMoney(order.totalCents, order.currencyCode)}
                  </Money>
                  <CreditOrderActions
                    orderId={order.id}
                    label={`${order.packName} for ${order.organization.name}`}
                  />
                </ListRowActions>
              </ListRow>
            ))}
          </ListPanel>
        </SettingsSection>
      )}

      <SettingsSection
        title="Credit packs"
        description="Shown to workspace owners on Plan & billing, in this order. A pack taken off sale stays on orders already placed."
      >
        <CreditPacksClient packs={packs} />
      </SettingsSection>
    </PageShell>
  )
}
