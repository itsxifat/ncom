'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, Palette, Printer } from 'lucide-react'
import { toast } from 'sonner'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FinancialStatusBadge } from '@/components/store/status-badges'
import { WorkflowStateBadge } from '@/components/store/fraud-badges'
import { OrderStatusColorSettings } from '@/components/store/order-status-colors'
import { Money } from '@/components/store/form-controls'
import { setOrderStatusAction } from '@/app/(dashboard)/courier-actions'
import { formatMoney } from '@/lib/money'
import {
  MANUAL_WORKFLOW_STATES,
  WORKFLOW_STATE_LABEL,
  type ManualWorkflowState,
} from '@/server/courier/statusMap'
import {
  TONE_STYLES,
  resolveStatusColors,
  type StatusColorMap,
} from '@/lib/order-status-colors'
import { cn } from '@/lib/utils'
import type {
  FinancialStatus,
  OrderWorkflowState,
} from '@/generated/prisma/enums'

export interface OrderListRow {
  id: string
  orderNumber: string
  customerName: string
  itemCount: number
  placedOn: string
  financialStatus: FinancialStatus
  /**
   * The one status this order has — `orderStatus()` of its pipeline state and
   * its cancellation, resolved on the server. Not the raw `workflowState`
   * column: that is half the answer, and rendering it is how this list came to
   * show "Pending" for orders the detail page called cancelled.
   */
  workflowState: OrderWorkflowState
  storeName: string | null
  pageTitle: string | null
  offerLabel: string | null
  totalCents: number
  currencyCode: string
}

/**
 * The order book.
 *
 * Two things happen on this screen: seeing at a glance which orders are in
 * trouble, and moving one along the pipeline. Printing is deliberately **not**
 * one of them — it moved to /labels, which is a packing bench rather than a
 * list, and having a second selection-and-print implementation here meant two
 * screens drifting apart while claiming to do the same job. The header keeps a
 * signpost to it so the function is still findable from where it used to live.
 *
 * Colour carries the status because that is what a merchant scanning a hundred
 * rows is actually reading — the badge text is confirmation, not the signal.
 * Which status gets which colour is the workspace's own decision (see
 * lib/order-status-colors.ts); the row tint and the spine down its leading edge
 * both come from it, because a tint alone is too weak on a busy screen and a
 * spine alone is too easy to miss on a phone.
 *
 * Rows are whole-row links; the status menu is lifted above that overlay so
 * changing a status does not open the order.
 */
export function OrderList({
  orders,
  total,
  base,
  statusColors,
  canEditStatus,
}: {
  orders: OrderListRow[]
  total: number
  base: string
  statusColors: StatusColorMap
  /** Viewers see the colours but cannot move an order along. */
  canEditStatus: boolean
}) {
  const colors = resolveStatusColors(statusColors)

  return (
    <ListPanel>
      <ListPanelHeader className="flex-wrap">
        <span className="text-muted-foreground text-sm">
          {total} {total === 1 ? 'order' : 'orders'}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {/* A signpost, not a second implementation. Bulk printing used to
              live on this screen, so the people who did it here every morning
              need to be told once where it went. */}
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/labels" />}
          >
            <Printer />
            Print labels
          </Button>

          {/* The colour key lives on the list it explains. A merchant who wants
              returns to shout at them is looking at a return when they decide
              that, and sending them to a settings page loses the thought. */}
          {canEditStatus && (
            <OrderStatusColorSettings
              current={statusColors}
              trigger={
                <Button type="button" size="sm" variant="ghost">
                  <Palette />
                  Colours
                </Button>
              }
            />
          )}
        </div>
      </ListPanelHeader>

      {orders.map((order) => {
        const tone = TONE_STYLES[colors[order.workflowState]]

        return (
          <ListRow
            key={order.id}
            interactive
            className={cn('pl-6 sm:pl-7', tone.row)}
          >
            {/* The spine. Absolute rather than a border so it does not shift
                the row's contents when the tone is "none". */}
            <span
              aria-hidden
              className={cn('absolute inset-y-0 left-0 w-[3px]', tone.bar)}
            />

            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ListRowText
                className="flex-1"
                title={
                  <Link
                    href={`${base}/${order.id}`}
                    className="after:absolute after:inset-0 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                }
                meta={
                  <>
                    {order.customerName} · {order.itemCount}{' '}
                    {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    {order.placedOn}
                  </>
                }
                badges={
                  <>
                    <FinancialStatusBadge status={order.financialStatus} />
                    {/* Which storefront sold it. One catalogue can be sold from
                        several landing pages, so this is how a merchant tells
                        which page is actually working. */}
                    {order.storeName && (
                      <Badge variant="outline">{order.storeName}</Badge>
                    )}
                    {order.pageTitle && (
                      <Badge variant="outline">{order.pageTitle}</Badge>
                    )}
                    {order.offerLabel && (
                      <Badge variant="secondary">{order.offerLabel}</Badge>
                    )}
                  </>
                }
              />
            </div>

            <ListRowActions>
              {/* Where the parcel is, and the control that moves it — the same
                  element, because on this screen reading the status and
                  changing it are one action. A merchant packing thirty parcels
                  should not open thirty pages. */}
              <StatusControl
                orderId={order.id}
                state={order.workflowState}
                canEdit={canEditStatus}
              />
              <Money>{formatMoney(order.totalCents, order.currencyCode)}</Money>
            </ListRowActions>
          </ListRow>
        )
      })}
    </ListPanel>
  )
}

/**
 * The delivery status, as a menu.
 *
 * Only the states a human is allowed to assert are offered —
 * MANUAL_WORKFLOW_STATES, the same list the server validates against. PENDING
 * and FRAUD_REVIEW are screening outcomes rather than delivery facts, and
 * CANCELLED belongs to the cancel flow because it returns stock and closes the
 * order. Offering them here would be offering a button that fails.
 *
 * Falls back to a plain badge for viewers and for cancelled orders, so the
 * status still reads the same everywhere.
 */
function StatusControl({
  orderId,
  state,
  canEdit,
}: {
  orderId: string
  state: OrderWorkflowState
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // A cancelled order is read-only here, and now that there is one status
  // rather than two it is the status itself that says so — no second
  // `cancelled` flag travelling alongside it to disagree with.
  if (!canEdit || state === 'CANCELLED') {
    return <WorkflowStateBadge state={state} />
  }

  const change = (next: ManualWorkflowState) => {
    if (next === state) return

    startTransition(async () => {
      const result = await setOrderStatusAction(orderId, next)
      if (result.ok) {
        toast.success(`Moved to ${WORKFLOW_STATE_LABEL[next]}`)
        // The action revalidates /orders, so the row is already re-rendered by
        // the time this runs. The refresh is for the case where this list is
        // reached from a filtered URL whose result set the change just left.
        router.refresh()
      } else {
        toast.error(result.error ?? 'Could not change the status')
      }
    })
  }

  return (
    <DropdownMenu>
      {/* The badge and chevron live inside the `render` element rather than
          being passed as the trigger's children: Base UI substitutes the
          element wholesale, and children handed to the trigger alongside a
          `render` do not reach it — the trigger renders, and clicking it opens
          nothing. `relative z-10` lifts it above the row's link overlay, or
          opening the menu would open the order instead. */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={pending}
            className="relative z-10 inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
            aria-label={`Delivery status: ${WORKFLOW_STATE_LABEL[state]}. Change it.`}
          >
            <WorkflowStateBadge state={state} />
            {pending ? (
              <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
            ) : (
              <ChevronDown className="text-muted-foreground size-3.5" />
            )}
          </button>
        }
      />

      <DropdownMenuContent align="end" className="w-52">
        {/* The group is not decoration: DropdownMenuLabel is Base UI's
            Menu.GroupLabel, which throws if it is not inside a Menu.Group — and
            the throw takes the whole popup with it, so the trigger opens
            nothing at all. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move this order to</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MANUAL_WORKFLOW_STATES.map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() => change(option)}
              disabled={option === state}
            >
              <span className="flex-1">{WORKFLOW_STATE_LABEL[option]}</span>
              {option === state && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
