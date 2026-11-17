import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  FileText,
  Info,
  Lock,
  Sparkles,
} from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getEntitlementsWithUsage } from '@/server/services/entitlementService'
import {
  findOpenBill,
  listPlanOrders,
} from '@/server/services/planCheckoutService'
import { daysUntil } from '@/lib/billing-access'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { aiBuilderAvailable } from '@/server/services/aiSettingsService'
import {
  getAiCreditSummary,
  listAiCreditEntries,
  listCreditOrders,
  listCreditPacks,
} from '@/server/services/aiCreditService'
import { prisma } from '@/server/db/client'
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
import { Button } from '@/components/ui/button'
import { Money } from '@/components/store/form-controls'
import { UsageMeter } from '@/components/dashboard/usage-meter'
import { formatMoney } from '@/lib/money'
import {
  AVAILABILITY_LABELS,
  FEATURE_KEYS,
  FEATURE_LABELS,
  SUPPORT_TIER_LABELS,
} from '@/lib/plans'
import { onlinePaymentAvailable } from '@/server/services/enfinitoPaySettingsService'
import { listOrganizationInvoices } from '@/server/billing/invoices'
import { currentPolicy } from '@/server/billing/crm'
import { vatNote } from '@/server/billing/tax'
import { SubscriptionControls } from './SubscriptionControls'
import { AiCreditsSection } from './AiCreditsSection'
import { PayOrderButton } from './PayOrderButton'
import { PayBillButton } from './PayBillButton'

export const metadata = { title: 'Plan & billing' }

const ORDER_KIND_LABELS: Record<string, string> = {
  TRIAL: 'Free trial',
  RENEWAL: 'Bill',
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  AUTO_ACTIVATED: 'Activated',
  PAID: 'Paid',
  ACTIVATED: 'Activated',
  CANCELED: 'Cancelled',
  FAILED: 'Failed',
}

/**
 * What the owner is told on coming back from Enfinito Pay without a paid
 * order (`?payment=`). Paid ones land on `?activated=1` or `?credits=added`.
 */
const PAYMENT_NOTICES: Record<string, string> = {
  cancelled:
    'Payment was cancelled, so nothing was charged. You can pay the order below whenever you’re ready.',
  failed:
    'The payment didn’t go through and nothing was charged. Try again, or pay another way.',
  processing:
    'Your payment is being confirmed. Refresh this page in a minute — there’s no need to pay again.',
  unavailable:
    'Your order is saved, but the payment page couldn’t be opened. Try Pay now below in a minute.',
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    activated?: string
    pending?: string
    payment?: string
    credits?: string
    trial?: string
  }>
}) {
  const { activated, pending, payment, credits, trial } = await searchParams
  const { organization, role } = await getActiveOrganization()

  const [
    { entitlements, usage },
    orders,
    selfServe,
    subscription,
    aiAvailable,
    aiCredits,
    creditPacks,
    creditOrders,
  ] = await Promise.all([
    getEntitlementsWithUsage(organization.id),
    listPlanOrders(organization.id),
    getPlatformFlag('billing.selfServeUpgrades'),
    prisma.subscription.findUnique({
      where: { organizationId: organization.id },
      select: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        unitPriceCents: true,
        currencyCode: true,
        coupon: { select: { code: true, description: true } },
      },
    }),
    aiBuilderAvailable(),
    getAiCreditSummary(organization.id),
    listCreditPacks(),
    listCreditOrders(organization.id),
  ])
  const [payOnline, invoices, policy, openBill] = await Promise.all([
    onlinePaymentAvailable(),
    listOrganizationInvoices(organization.id),
    currentPolicy(),
    findOpenBill(organization.id),
  ])
  const { access } = entitlements
  const hasPlan = !(
    access.state === 'RESTRICTED' && access.reason === 'NO_PLAN'
  )
  const invoiceIds: Record<string, number> = {}
  for (const invoice of invoices) {
    const orderId = invoice.planOrderId ?? invoice.creditOrderId
    if (orderId) invoiceIds[orderId] = invoice.id
  }
  // After the summary, not beside it: reading the summary is what gives a
  // workspace its plan's one-time credits, and the history should show them.
  const creditEntries = await listAiCreditEntries(organization.id, 10)
  // Shown where the AI builder is offered — and, if it is switched off for a
  // while, still to a workspace with credits or orders, so what it paid for
  // does not seem to have vanished.
  const showAiCredits =
    aiAvailable || aiCredits.balance > 0 || creditOrders.length > 0

  // Billing is owner-only, matching the team roles: an ADMIN runs the store, an
  // OWNER owns the account.
  const canManage = role === 'OWNER'

  return (
    <PageShell>
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Plan & billing"
        description="What this workspace is on, what it has used, and what changing plan would give you."
        actions={
          canManage && selfServe ? (
            <Button
              render={<Link href="/billing/plans" />}
              nativeButton={false}
            >
              {hasPlan ? 'Change package' : 'Choose a package'}
              <ArrowUpRight />
            </Button>
          ) : undefined
        }
      />

      {activated && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="mr-1 inline size-4" />
          Your new plan is active. The limits below are already in effect.
        </p>
      )}
      {credits === 'added' && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="mr-1 inline size-4" />
          Payment received — your AI credits are ready to use.
        </p>
      )}
      {payment && PAYMENT_NOTICES[payment] ? (
        <p className="bg-muted rounded-xl p-3 text-sm">
          <Info className="mr-1 inline size-4" />
          {PAYMENT_NOTICES[payment]}
        </p>
      ) : (
        pending &&
        !payOnline && (
          <p className="bg-muted rounded-xl p-3 text-sm">
            <Info className="mr-1 inline size-4" />
            We&apos;ve recorded your request. Online payment isn&apos;t open
            yet, so our team will contact you to finish it — nothing has changed
            on your workspace in the meantime.
          </p>
        )
      )}

      {trial === 'started' && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="mr-1 inline size-4" />
          Your free trial of {entitlements.planName} has started — no payment
          needed until{' '}
          {subscription?.trialEndsAt?.toLocaleDateString() ?? 'it ends'}.{' '}
          <Link href="/dashboard" className="font-semibold underline">
            Start building →
          </Link>
        </p>
      )}

      <BillStatus
        access={access}
        planName={entitlements.planName}
        canManage={canManage}
        bill={
          openBill
            ? {
                totalLabel: formatMoney(
                  openBill.totalCents,
                  openBill.currencyCode
                ),
                dueAt: openBill.dueAt,
              }
            : null
        }
        listPriceLabel={
          subscription
            ? `${formatMoney(subscription.unitPriceCents, subscription.currencyCode)}/${entitlements.interval === 'ANNUAL' ? 'year' : 'month'}`
            : null
        }
      />

      {hasPlan && (
        <SettingsSection
          title="Current plan"
          description="Includes any add-ons and workspace-specific limits we have set for you."
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl font-semibold">
                    {entitlements.planName}
                  </h3>
                  <Badge
                    variant={
                      entitlements.status === 'ACTIVE' ||
                      entitlements.status === 'TRIALING'
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {entitlements.status.toLowerCase()}
                  </Badge>
                  {subscription?.cancelAtPeriodEnd && (
                    <Badge variant="outline">Ends at period close</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {entitlements.interval === 'ANNUAL'
                    ? 'Billed yearly'
                    : 'Billed monthly'}
                  {entitlements.status === 'TRIALING'
                    ? subscription?.trialEndsAt &&
                      ` · free trial until ${subscription.trialEndsAt.toLocaleDateString()}`
                    : subscription?.currentPeriodEnd &&
                      ` · paid until ${subscription.currentPeriodEnd.toLocaleDateString()}`}
                  {' · '}
                  {SUPPORT_TIER_LABELS[entitlements.supportTier]} support
                </p>
                {subscription?.coupon && (
                  <p className="mt-1 text-xs text-emerald-600">
                    Code {subscription.coupon.code} applied
                    {subscription.coupon.description
                      ? ` — ${subscription.coupon.description}`
                      : ''}
                  </p>
                )}
                {entitlements.quotaEnforcementDisabled && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Limits are currently waived on this workspace.
                  </p>
                )}
              </div>

              {canManage && (
                <SubscriptionControls
                  cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
                  isFreePlan={entitlements.isDefaultPlan}
                />
              )}
            </div>

            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <UsageMeter
                quota="PAGES"
                used={usage.pages}
                limit={entitlements.quotas.PAGES}
                note={entitlements.fairUseNote}
              />
              <UsageMeter
                quota="STORES"
                used={usage.stores}
                limit={entitlements.quotas.STORES}
              />
              <UsageMeter
                quota="CUSTOM_DOMAINS"
                used={usage.customDomains}
                limit={entitlements.quotas.CUSTOM_DOMAINS}
              />
              <UsageMeter
                quota="TEAM_MEMBERS"
                used={usage.teamMembers}
                limit={entitlements.quotas.TEAM_MEMBERS}
              />
              <UsageMeter
                quota="STORAGE_BYTES"
                used={usage.storageBytes}
                limit={entitlements.quotas.STORAGE_BYTES}
              />
              <UsageMeter
                quota="MONTHLY_TRAFFIC_BYTES"
                used={usage.monthlyTrafficBytes}
                limit={entitlements.quotas.MONTHLY_TRAFFIC_BYTES}
                note={entitlements.fairUseNote}
              />
            </div>

            <p className="text-muted-foreground text-xs">
              Traffic and visitors cover {usage.period} and reset on the 1st.{' '}
              {usage.monthlyVisitors.toLocaleString()} visitors so far
              {entitlements.quotas.MONTHLY_VISITORS !== null &&
                ` of ${entitlements.quotas.MONTHLY_VISITORS.toLocaleString()} recommended`}
              .
            </p>
          </div>
        </SettingsSection>
      )}

      {hasPlan && (
        <SettingsSection
          title="What's included"
          description="Anything marked as an add-on can be switched on from the plan picker."
        >
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {FEATURE_KEYS.map((key) => {
              const usable = entitlements.features[key]
              const availability = entitlements.availability[key]

              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 py-1 text-sm"
                >
                  <span className={usable ? '' : 'text-muted-foreground'}>
                    {FEATURE_LABELS[key]}
                  </span>
                  {usable ? (
                    <Check className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {AVAILABILITY_LABELS[availability]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </SettingsSection>
      )}

      {showAiCredits && hasPlan && (
        <AiCreditsSection
          summary={aiCredits}
          packs={creditPacks}
          orders={creditOrders}
          entries={creditEntries}
          canBuy={canManage}
          payOnline={payOnline}
          vatNote={policy ? vatNote(policy) : ''}
          invoiceIds={invoiceIds}
        />
      )}

      {orders.length > 0 && (
        <SettingsSection
          title="History"
          description="Every package, trial and bill on this workspace."

          bare
        >
          <ListPanel>
            {orders.map((order) => (
              <ListRow key={order.id}>
                <ListRowText
                  title={`${ORDER_KIND_LABELS[order.kind] ? `${ORDER_KIND_LABELS[order.kind]} · ` : ''}${order.plan.name} · ${order.interval === 'ANNUAL' ? 'annual' : 'monthly'}`}
                  meta={
                    <>
                      {order.createdAt.toLocaleDateString()}
                      {order.couponCode && ` · code ${order.couponCode}`}
                      {order.discountCents > 0 &&
                        ` · ${formatMoney(order.discountCents, order.currencyCode)} off`}
                    </>
                  }
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
                  {invoiceIds[order.id] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      render={
                        <Link
                          href={`/print/invoices/${invoiceIds[order.id]}`}
                        />
                      }
                      nativeButton={false}
                    >
                      <FileText />
                      Invoice
                    </Button>
                  )}
                  {canManage &&
                    payOnline &&
                    order.status === 'AWAITING_PAYMENT' && (
                      <PayOrderButton kind="plan" orderId={order.id} />
                    )}
                </ListRowActions>
              </ListRow>
            ))}
          </ListPanel>
        </SettingsSection>
      )}

      {!canManage && (
        <p className="text-muted-foreground text-xs">
          Only a workspace owner can change the plan.
        </p>
      )}
    </PageShell>
  )
}

type Access = Awaited<
  ReturnType<typeof getEntitlementsWithUsage>
>['entitlements']['access']

/**
 * Where the workspace stands with its bill, and the one thing to do about it:
 * choose a package, keep a trial going, pay a bill that is due, or pay to
 * bring a paused workspace back.
 */
function BillStatus({
  access,
  planName,
  canManage,
  bill,
  listPriceLabel,
}: {
  access: Access
  planName: string
  canManage: boolean
  bill: { totalLabel: string; dueAt: Date | null } | null
  listPriceLabel: string | null
}) {
  const owner = (node: React.ReactNode) =>
    canManage ? (
      node
    ) : (
      <p className="text-muted-foreground text-xs">
        Only a workspace owner can pay or choose a package.
      </p>
    )

  if (access.state === 'RESTRICTED') {
    if (access.reason === 'NO_PLAN' || access.reason === 'ENDED') {
      return (
        <StatusCard
          tone="welcome"
          icon={<Sparkles className="size-5" />}
          title={
            access.reason === 'NO_PLAN'
              ? 'Choose a package to get started'
              : 'Your plan has ended'
          }
          body={
            access.reason === 'NO_PLAN'
              ? 'Pick the package that fits your business. Packages with a free trial start straight away — no payment needed.'
              : 'Your sites are offline. Nothing has been deleted — choose a package and everything comes back.'
          }
        >
          {owner(
            <Button
              render={<Link href="/billing/plans" />}
              nativeButton={false}
            >
              See packages
              <ArrowUpRight />
            </Button>
          )}
        </StatusCard>
      )
    }
    return (
      <StatusCard
        tone="danger"
        icon={<Lock className="size-5" />}
        title={
          access.reason === 'TRIAL_ENDED'
            ? 'Your free trial has ended — the workspace is paused'
            : 'Your workspace is paused for an unpaid bill'
        }
        body={`Your sites are offline and the dashboard is limited to this page. Nothing has been deleted: pay ${bill?.totalLabel ?? 'the bill'} and everything — sites, pages, products, orders — is back the moment the payment goes through.`}
      >
        {owner(
          <PayBillButton
            label={`Pay ${bill?.totalLabel ?? 'now'} and restore`}
          />
        )}
      </StatusCard>
    )
  }

  if (access.state === 'GRACE') {
    return (
      <StatusCard
        tone="danger"
        icon={<AlertTriangle className="size-5" />}
        title={
          access.reason === 'TRIAL_ENDED'
            ? `Your free trial of ${planName} has ended`
            : `Your ${planName} bill is due`
        }
        body={`Pay ${bill?.totalLabel ?? 'the bill'} by ${access.restrictsAt.toLocaleString()} to keep your sites live. After that the workspace is paused until it is paid.`}
      >
        {owner(<PayBillButton label={`Pay ${bill?.totalLabel ?? 'now'}`} />)}
      </StatusCard>
    )
  }

  if (access.trial && access.endsAt) {
    const days = daysUntil(access.endsAt)
    return (
      <StatusCard
        tone="info"
        icon={<Clock className="size-5" />}
        title={`Free trial of ${planName} — ${days <= 1 ? 'ends within a day' : `${days} days left`}`}
        body={`Your trial ends ${access.endsAt.toLocaleString()}. To keep everything running after that, pay ${bill?.totalLabel ?? listPriceLabel ?? 'for the package'} — any time before then; paying early does not cut the trial short.`}
      >
        {owner(
          <div className="flex flex-wrap items-start gap-2">
            <PayBillButton label="Pay now" />
            <Button
              variant="outline"
              render={<Link href="/billing/plans" />}
              nativeButton={false}
            >
              Change package
            </Button>
          </div>
        )}
      </StatusCard>
    )
  }

  if (bill?.dueAt) {
    return (
      <StatusCard
        tone="info"
        icon={<FileText className="size-5" />}
        title={`Your next bill: ${bill.totalLabel}`}
        body={`Due ${bill.dueAt.toLocaleString()}. Pay it before then and your next period starts right where this one ends.`}
      >
        {owner(<PayBillButton label="Pay now" variant="outline" />)}
      </StatusCard>
    )
  }

  return null
}

function StatusCard({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: 'welcome' | 'info' | 'danger'
  icon: React.ReactNode
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={
        tone === 'danger'
          ? 'flex gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/60 dark:bg-red-950/30'
          : tone === 'welcome'
            ? 'border-primary/30 bg-primary/5 flex gap-4 rounded-2xl border p-5'
            : 'border-border bg-card flex gap-4 rounded-2xl border p-5'
      }
    >
      <div
        className={
          tone === 'danger'
            ? 'mt-0.5 text-red-700 dark:text-red-300'
            : 'text-primary mt-0.5'
        }
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {body}
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
