import { Suspense } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  CircleCheck,
  Package,
  Plus,
  ShieldAlert,
  ShoppingBag,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getHomeSummary, type HomeSummary } from '@/server/services/homeService'
import { getInventorySummary } from '@/server/services/inventoryService'
import { getOrderStatusColors } from '@/server/services/organizationSettingsService'
import { REPORTING_TIMEZONE } from '@/lib/date-range'
import { formatMoney } from '@/lib/money'
import { resolveStatusColors } from '@/lib/order-status-colors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { PageShell } from '@/components/app/page-shell'
import { StatCard } from '@/components/app/stat-card'
import { ListPanel, ListPanelHeader } from '@/components/app/list-panel'
import { WorkflowStateBadge } from '@/components/store/fraud-badges'

/**
 * Home: what needs doing, then how it is going.
 *
 * The old dashboard counted stores and pages — things a merchant made once —
 * and gave the rest of the screen to a banner about building pages. A merchant
 * opens this between parcels, so the first thing on it is now the short list
 * of things only they can do (orders the fraud check held, orders approved and
 * not yet shipped, deliveries that failed, stock running out), each one a card
 * that opens exactly that list. The day's numbers come second, and a setup
 * checklist sits beside them until the workspace no longer needs it.
 */
export default async function HomePage() {
  const { session, organization } = await getActiveOrganization()

  const [summary, statusColors] = await Promise.all([
    getHomeSummary(organization.id),
    getOrderStatusColors(organization.id),
  ])
  const tones = resolveStatusColors(statusColors)

  const now = new Date()
  const firstName = session.user.name?.split(' ')[0]
  const newPageHref = summary.setup.firstStoreId
    ? `/stores/${summary.setup.firstStoreId}/pages/new`
    : '/stores/new'

  const setupSteps = [
    {
      label: 'Create your website',
      done: summary.setup.hasStore,
      href: '/stores/new',
      action: 'Start',
    },
    {
      label: 'Add your first product',
      done: summary.setup.hasProducts,
      href: '/products/new',
      action: 'Add',
    },
    {
      label: 'Connect a courier',
      done: summary.setup.hasCourier,
      href: '/settings/courier',
      action: 'Connect',
    },
    {
      label: 'Publish your first page',
      done: summary.setup.hasPublishedPage,
      href: newPageHref,
      action: 'Start',
    },
    {
      label: 'Add your Facebook pixel',
      done: summary.setup.hasPixel,
      href: '/tracking',
      action: 'Set up',
    },
  ]
  const setupDone = setupSteps.filter((step) => step.done).length

  return (
    <PageShell>
      <PageHeader
        eyebrow={dhakaDate(now)}
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href="/products/new" />}
              nativeButton={false}
            >
              Add product
            </Button>
            <Button render={<Link href={newPageHref} />} nativeButton={false}>
              <Plus />
              New page
            </Button>
          </>
        }
      />

      <section aria-labelledby="needs-you" className="flex flex-col gap-3">
        <h2 id="needs-you" className="text-base font-semibold">
          Needs you today
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AttentionCards summary={summary} />
          <Suspense fallback={null}>
            <LowStockCard organizationId={organization.id} />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="today" className="flex flex-col gap-3">
        <h2 id="today" className="text-base font-semibold">
          Today so far
        </h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Orders"
            value={summary.today.orders}
            hint={compareWithYesterday(
              summary.today.orders,
              summary.today.ordersYesterday
            )}
          />
          <StatCard
            label="Sales"
            value={formatMoney(summary.today.salesCents, summary.currencyCode)}
            hint={`${formatMoney(summary.today.collectedCents, summary.currencyCode)} collected so far`}
          />
          <StatCard
            label="Page visits"
            value={summary.today.visits.toLocaleString('en-US')}
            hint={
              summary.today.visits > 0
                ? `${((summary.today.orders / summary.today.visits) * 100).toFixed(1)}% placed an order`
                : 'Nobody yet today'
            }
          />
          <StatCard
            label="Delivered, last 30 days"
            value={
              summary.delivery.settled > 0 ? `${summary.delivery.rate}%` : '—'
            }
            hint={
              summary.delivery.settled > 0
                ? 'of finished orders reached the customer'
                : 'Shows once your first parcels arrive'
            }
          />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ListPanel aria-labelledby="latest">
          <ListPanelHeader>
            <h2 id="latest" className="text-base font-semibold">
              Latest orders
            </h2>
            <Link
              href="/orders"
              className="text-sm font-semibold hover:underline"
            >
              View all
            </Link>
          </ListPanelHeader>
          {summary.latestOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <ShoppingBag className="size-4.5" />
              </span>
              <p className="font-semibold">No orders yet</p>
              <p className="text-muted-foreground max-w-xs text-sm">
                When someone orders from one of your pages, it shows up here.
              </p>
            </div>
          ) : (
            summary.latestOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="hover:bg-muted/50 flex items-center gap-3 px-5 py-3.5 transition-colors sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {order.customer}
                  </span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {order.orderNumber} · {order.summary} ·{' '}
                    {timeAgo(order.createdAt, now)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatMoney(order.totalCents, order.currencyCode)}
                </span>
                <span className="hidden shrink-0 sm:block">
                  <WorkflowStateBadge
                    state={order.status}
                    tone={tones[order.status]}
                  />
                </span>
              </Link>
            ))
          )}
        </ListPanel>

        <div className="flex flex-col gap-4">
          {setupDone < setupSteps.length && (
            <section
              aria-labelledby="setup"
              className="bg-card ring-border flex flex-col gap-4 rounded-xl p-5 ring-1"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="setup" className="text-base font-semibold">
                    Finish setting up
                  </h2>
                  <span className="text-muted-foreground text-sm font-medium">
                    {setupDone} of {setupSteps.length} done
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Setup progress"
                  aria-valuemin={0}
                  aria-valuemax={setupSteps.length}
                  aria-valuenow={setupDone}
                  className="bg-muted h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-foreground h-full rounded-full"
                    style={{
                      width: `${(setupDone / setupSteps.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <ol className="flex flex-col">
                {setupSteps.map((step) => (
                  <li
                    key={step.label}
                    className="flex min-h-11 items-center gap-3"
                  >
                    {step.done ? (
                      <span className="bg-lime text-lime-foreground flex size-5.5 shrink-0 items-center justify-center rounded-full">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="border-input size-5.5 shrink-0 rounded-full border-[1.5px]" />
                    )}
                    <span
                      className={cn(
                        'flex-1 text-sm',
                        step.done
                          ? 'text-muted-foreground line-through'
                          : 'font-semibold'
                      )}
                    >
                      {step.label}
                      {step.done && <span className="sr-only"> (done)</span>}
                    </span>
                    {!step.done && (
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={step.href} />}
                        nativeButton={false}
                      >
                        {step.action}
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <ListPanel aria-labelledby="top-pages">
            <ListPanelHeader>
              <h2 id="top-pages" className="text-base font-semibold">
                Best pages this week
              </h2>
              <Link
                href="/stores"
                className="text-sm font-semibold hover:underline"
              >
                All pages
              </Link>
            </ListPanelHeader>
            {summary.topPages.length === 0 ? (
              <p className="text-muted-foreground px-5 py-6 text-sm sm:px-6">
                Pages that bring in orders this week are ranked here.
              </p>
            ) : (
              summary.topPages.map((page) => (
                <Link
                  key={page.id}
                  href={`/stores/${page.storeId}/pages/${page.id}/edit`}
                  className="hover:bg-muted/50 flex items-center gap-3 px-5 py-3 transition-colors sm:px-6"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {page.title}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {page.orders} {page.orders === 1 ? 'order' : 'orders'}
                  </span>
                </Link>
              ))
            )}
          </ListPanel>
        </div>
      </div>
    </PageShell>
  )
}

/**
 * One card per kind of thing waiting on the merchant — and nothing for a kind
 * with nothing waiting, so a quiet day reads as a quiet day rather than as a
 * row of zeroes to check.
 */
function AttentionCards({ summary }: { summary: HomeSummary }) {
  const { review, toShip, failed } = summary.attention

  if (review + toShip + failed === 0) {
    return (
      <div className="bg-card ring-border flex items-center gap-3 rounded-xl p-5 ring-1 sm:col-span-2">
        <span className="bg-lime text-lime-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <CircleCheck className="size-4.5" />
        </span>
        <span>
          <span className="block font-semibold">You’re all caught up</span>
          <span className="text-muted-foreground block text-sm">
            No orders are waiting on you right now.
          </span>
        </span>
      </div>
    )
  }

  return (
    <>
      {review > 0 && (
        <AttentionCard
          href="/orders?delivery=FRAUD_REVIEW"
          tone="amber"
          icon={ShieldAlert}
          title={`${review} ${review === 1 ? 'order' : 'orders'} to review`}
          body="The fraud check held these. Look at each customer’s delivery record before you ship."
          action="Review orders"
        />
      )}
      {toShip > 0 && (
        <AttentionCard
          href="/orders?delivery=PROCESSING"
          tone="blue"
          icon={Truck}
          title={`${toShip} ready to ship`}
          body="Approved and waiting to go to your courier."
          action="Ship them"
        />
      )}
      {failed > 0 && (
        <AttentionCard
          href="/orders?delivery=FAILED"
          tone="red"
          icon={TriangleAlert}
          title={`${failed} ${failed === 1 ? 'delivery' : 'deliveries'} failed`}
          body="The courier could not deliver. A quick call to the customer usually saves the sale."
          action="See who to call"
        />
      )}
    </>
  )
}

/**
 * Streamed in on its own, because for products that live on the merchant's
 * website the stock can only be learned by asking that website — and the rest
 * of Home should not wait on someone else's server to answer.
 */
async function LowStockCard({ organizationId }: { organizationId: string }) {
  const stock = await getInventorySummary(organizationId).catch(() => null)
  if (!stock || stock.low + stock.out === 0) return null

  const title =
    stock.out > 0
      ? `${stock.out} ${stock.out === 1 ? 'item' : 'items'} out of stock`
      : `${stock.low} ${stock.low === 1 ? 'item' : 'items'} running low`

  return (
    <AttentionCard
      href={`/inventory?stock=${stock.out > 0 ? 'out' : 'low'}`}
      tone="neutral"
      icon={Package}
      title={title}
      body={
        stock.out > 0 && stock.low > 0
          ? `And ${stock.low} more running low. Restock before your pages sell what you don’t have.`
          : 'Restock before your pages sell what you don’t have.'
      }
      action="See stock"
    />
  )
}

const TONE_CHIP = {
  amber: 'bg-amber-50 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200',
  blue: 'bg-sky-50 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200',
  red: 'bg-red-50 text-red-800 dark:bg-red-400/15 dark:text-red-200',
  neutral: 'bg-muted text-foreground',
} as const

function AttentionCard({
  href,
  tone,
  icon: Icon,
  title,
  body,
  action,
}: {
  href: string
  tone: keyof typeof TONE_CHIP
  icon: LucideIcon
  title: string
  body: string
  action: string
}) {
  return (
    <Link
      href={href}
      className="group/card bg-card ring-border hover:ring-foreground/20 flex flex-col gap-2.5 rounded-xl p-5 ring-1 transition-shadow"
    >
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-lg',
          TONE_CHIP[tone]
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className="text-muted-foreground text-sm">{body}</span>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold">
        {action}
        <ArrowRight className="size-3.5 transition-transform group-hover/card:translate-x-0.5" />
      </span>
    </Link>
  )
}

/** "Wednesday, 21 October", in Dhaka — the day the merchant is living in. */
function dhakaDate(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORTING_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
}

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: REPORTING_TIMEZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
  )
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function compareWithYesterday(today: number, yesterday: number): string {
  if (today === yesterday) return 'Same as yesterday'
  const difference = Math.abs(today - yesterday)
  return `${difference} ${today > yesterday ? 'more' : 'fewer'} than yesterday`
}

/**
 * "10 min ago", "3 hr ago", then the date. Relative times do not depend on
 * the reader's timezone, so unlike a clock time this is safe to render on the
 * server.
 */
function timeAgo(then: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORTING_TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(then)
}
