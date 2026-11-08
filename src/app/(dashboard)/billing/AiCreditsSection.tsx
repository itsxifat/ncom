import { Coins } from 'lucide-react'
import type {
  AiCreditEntryRow,
  AiCreditSummary,
  CreditPackRow,
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
import { BuyCreditPackButton } from './BuyCreditPackButton'
import { PayOrderButton } from './PayOrderButton'

const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  CANCELED: 'Cancelled',
}

interface CreditOrderRow {
  id: string
  packName: string
  credits: number
  totalCents: number
  currencyCode: string
  status: string
  createdAt: Date
}

/**
 * "AI credits" on the billing page: what the workspace has to spend on the AI
 * builder, packs to buy more, and where its credits went.
 *
 * Two pots, said plainly, because they behave differently: the plan's monthly
 * credits come back on the 1st and do not pile up; bought ones stay until
 * used. The AI builder spends the monthly ones first.
 */
export function AiCreditsSection({
  summary,
  packs,
  orders,
  entries,
  canBuy,
  payOnline,
}: {
  summary: AiCreditSummary
  packs: CreditPackRow[]
  orders: CreditOrderRow[]
  entries: AiCreditEntryRow[]
  canBuy: boolean
  /** Enfinito Pay is set up: a pack is paid for on the spot. */
  payOnline: boolean
}) {
  const refreshes = new Date(summary.refreshesAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  return (
    <SettingsSection
      title="AI credits"
      description="Spent when the AI builder designs a site, a page or a section for you. Monthly credits come with your plan; bought credits never expire."
    >
      <div id="ai-credits" className="flex scroll-mt-24 flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Ready to use"
            value={summary.available}
            hint="Monthly credits are used first."
            strong
          />
          <Figure
            label="From your plan this month"
            value={summary.monthlyLeft}
            hint={
              summary.monthlyAllowance > 0
                ? `of ${summary.monthlyAllowance} · back to ${summary.monthlyAllowance} on ${refreshes}`
                : `${summary.planName} has no monthly credits`
            }
          />
          <Figure
            label="Bought or given"
            value={summary.balance}
            hint="Never expire."
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Buy credits</h3>
          {packs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Credit packs aren’t on sale yet. Contact us if you need more
              credits.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="ring-border flex flex-col gap-3 rounded-xl p-4 ring-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{pack.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {pack.credits.toLocaleString()} credits
                        </p>
                      </div>
                      <Coins className="text-muted-foreground size-5 shrink-0" />
                    </div>
                    <p className="font-display text-2xl font-semibold">
                      {pack.priceCents === 0
                        ? 'Free'
                        : formatMoney(pack.priceCents, pack.currencyCode)}
                    </p>
                    <BuyCreditPackButton packId={pack.id} disabled={!canBuy} />
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {!canBuy
                  ? 'Only a workspace owner can buy credits.'
                  : payOnline
                    ? 'Pay with Enfinito Pay — bKash, Nagad, Rocket, cards and more. The credits are added as soon as the payment is confirmed.'
                    : 'Online payment isn’t open yet: after you order, our team contacts you to finish the payment, and the credits are added as soon as it’s paid.'}
              </p>
            </>
          )}
        </div>

        {orders.length > 0 && (
          <div className="flex flex-col gap-3">
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
                    {canBuy &&
                      payOnline &&
                      order.status === 'AWAITING_PAYMENT' && (
                        <PayOrderButton kind="credits" orderId={order.id} />
                      )}
                  </ListRowActions>
                </ListRow>
              ))}
            </ListPanel>
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <ListPanel>
              {entries.map((entry) => (
                <ListRow key={entry.id}>
                  <ListRowText
                    title={entry.description}
                    meta={entry.createdAt.toLocaleString()}
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

function Figure({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string
  value: number
  hint: string
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl p-4',
        strong ? 'bg-lime/40' : 'bg-muted/60'
      )}
    >
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </div>
  )
}
