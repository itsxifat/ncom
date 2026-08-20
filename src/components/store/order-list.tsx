'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Printer, Receipt, X } from 'lucide-react'
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
import { FinancialStatusBadge } from '@/components/store/status-badges'
import { WorkflowStateBadge } from '@/components/store/fraud-badges'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
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
}

/**
 * The order book, with the morning's print run in it.
 *
 * Selection lives here rather than in a URL because it is a scratch decision —
 * "these eleven are going out on the van" — that nobody wants to bookmark, and
 * because a merchant tends to tick boxes while scrolling and would lose the lot
 * to a navigation.
 *
 * Rows stay whole-row links even with a checkbox on them; the checkbox is
 * lifted above the link's overlay so a tick does not open the order.
 */
export function OrderList({
  orders,
  total,
  base,
}: {
  orders: OrderListRow[]
  total: number
  base: string
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
      <ListPanelHeader>
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
        </div>
      </ListPanelHeader>

      {orders.map((order) => (
        <ListRow key={order.id} interactive>
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
                  {order.itemCount === 1 ? 'item' : 'items'} · {order.placedOn}
                </>
              }
              badges={
                <>
                  <FinancialStatusBadge status={order.financialStatus} />
                  {/* Where the parcel is. Shown beside the money statuses
                      because in a cash-on-delivery market they answer
                      different halves of "is this order done". */}
                  <WorkflowStateBadge state={order.workflowState} />
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
            <Money>{formatMoney(order.totalCents, order.currencyCode)}</Money>
          </ListRowActions>
        </ListRow>
      ))}
    </ListPanel>
  )
}
