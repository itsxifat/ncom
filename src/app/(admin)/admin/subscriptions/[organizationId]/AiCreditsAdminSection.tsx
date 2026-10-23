import type {
  AiCreditEntryRow,
  AiCreditSummary,
} from '@/server/services/aiCreditService'
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
import { cn } from '@/lib/utils'
import { CreditOrderActions } from '../../ai-credits/CreditOrderActions'
import { AdjustCreditsForm } from './AdjustCreditsForm'

const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  CANCELED: 'Cancelled',
}

interface OrderRow {
  id: string
  packName: string
  credits: number
  totalCents: number
  currencyCode: string
  status: string
  createdAt: Date
}

/** One workspace's AI credits, for the platform team. */
export function AiCreditsAdminSection({
  organizationId,
  summary,
  entries,
  orders,
}: {
  organizationId: string
  summary: AiCreditSummary
  entries: AiCreditEntryRow[]
  orders: OrderRow[]
}) {
  return (
    <SettingsSection
      title="AI credits"
      description={`${summary.available.toLocaleString()} ready to use: ${summary.monthlyLeft} of ${summary.monthlyAllowance} monthly credits from ${summary.planName} left, plus ${summary.balance.toLocaleString()} bought or given. Adding and removing changes the bought-or-given credits.`}
    >
      <div className="flex flex-col gap-5">
        <AdjustCreditsForm organizationId={organizationId} />

        {orders.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Credit orders</h3>
            <ListPanel>
              {orders.map((order) => (
                <ListRow key={order.id}>
                  <ListRowText
                    title={`${order.packName} · ${order.credits.toLocaleString()} credits`}
                    meta={order.createdAt.toLocaleDateString()}
                    badges={
                      <Badge
                        variant={
                          order.status === 'AWAITING_PAYMENT'
                            ? 'outline'
                            : 'secondary'
                        }
                      >
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    }
                  />
                  <ListRowActions>
                    <Money>
                      {formatMoney(order.totalCents, order.currencyCode)}
                    </Money>
                    {order.status === 'AWAITING_PAYMENT' && (
                      <CreditOrderActions
                        orderId={order.id}
                        label={order.packName}
                      />
                    )}
                  </ListRowActions>
                </ListRow>
              ))}
            </ListPanel>
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">History</h3>
            <ListPanel>
              {entries.map((entry) => (
                <ListRow key={entry.id}>
                  <ListRowText
                    title={entry.description}
                    meta={`${entry.createdAt.toLocaleString()} · ${entry.balanceAfter.toLocaleString()} bought or given after`}
                  />
                  <ListRowActions>
                    <span
                      className={cn(
                        'font-mono text-sm tabular-nums',
                        entry.credits > 0
                          ? 'text-emerald-600'
                          : 'text-muted-foreground'
                      )}
                    >
                      {entry.credits > 0 ? '+' : ''}
                      {entry.credits}
                    </span>
                  </ListRowActions>
                </ListRow>
              ))}
            </ListPanel>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
