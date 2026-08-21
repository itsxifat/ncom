'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check,
  ChevronDown,
  Loader2,
  Palette,
  Printer,
  Receipt,
  X,
} from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
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
  workflowState: OrderWorkflowState
  storeName: string | null
  pageTitle: string | null
  offerLabel: string | null
  totalCents: number
  currencyCode: string
  /** Cancelled orders cannot be moved along the pipeline by hand. */
  cancelled: boolean
}

/**
 * The order book, with the morning's print run in it.
 *
 * Three things happen on this screen and they are deliberately all reachable
 * without leaving it: seeing at a glance which orders are in trouble, moving
 * one along the pipeline, and printing a batch.
 *
 * Colour carries the status because that is what a merchant scanning a hundred
 * rows is actually reading — the badge text is confirmation, not the signal.
 * Which status gets which colour is the workspace's own decision (see
 * lib/order-status-colors.ts); the row tint and the spine down its leading edge
 * both come from it, because a tint alone is too weak on a busy screen and a
 * spine alone is too easy to miss on a phone.
 *
 * Selection lives here rather than in a URL because it is a scratch decision —
 * "these eleven are going out on the van" — that nobody wants to bookmark, and
 * because a merchant tends to tick boxes while scrolling and would lose the lot
 * to a navigation.
 *
 * Rows stay whole-row links even with a checkbox and a status menu on them;
 * both are lifted above the link's overlay so neither opens the order.
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const colors = resolveStatusColors(statusColors)

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allOnPage = orders.length > 0 && orders.every((o) => selected.has(o.id))

  const print = (format: 'sticker' | 'invoice') => {
    const ids = orders.filter((o) => selected.has(o.id)).map((o) => o.id)
    if (ids.length === 0) return
    // A new tab, because the print dialog opens over it and the merchant is
    // meant to come back to this list with their selection intact.
    window.open(
      `/print/orders?ids=${ids.join(',')}&format=${format}`,
      '_blank',
      'noopener'
    )
  }

  return (
    <ListPanel>
      <ListPanelHeader className="flex-wrap">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={allOnPage}
            indeterminate={!allOnPage && selected.size > 0}
            onCheckedChange={(checked) =>
              setSelected(
                checked ? new Set(orders.map((o) => o.id)) : new Set()
              )
            }
          />
          <span className="text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${total} ${total === 1 ? 'order' : 'orders'} — tick to print`}
          </span>
        </label>

        {/* Always shown, disabled until something is ticked, rather than
            appearing on selection. A control that is not there yet is a
            feature nobody knows exists — the first question asked of this
            screen was "where do I print". */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => print('sticker')}
          >
            <Printer />
            Print stickers
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => print('invoice')}
          >
            <Receipt />
            Print invoices
          </Button>
          {selected.size > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              <X />
              Clear
            </Button>
          )}

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
              {/* Above the row-wide link overlay, or ticking a box would open
                  the order instead of selecting it. Not wrapped in a <label>:
                  this checkbox is a button, so a label around it contributes an
                  empty name and hides the one the aria-label gives it. */}
              <Checkbox
                className="relative z-10 mt-0.5"
                checked={selected.has(order.id)}
                onCheckedChange={() => toggle(order.id)}
                aria-label={`Select ${order.orderNumber}`}
              />

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
                cancelled={order.cancelled}
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
  cancelled,
  canEdit,
}: {
  orderId: string
  state: OrderWorkflowState
  cancelled: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!canEdit || cancelled) {
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
