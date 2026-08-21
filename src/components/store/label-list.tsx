'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Layers, MapPin, Phone, Printer, Receipt, Truck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
import { WORKFLOW_STATE_LABEL } from '@/server/courier/statusMap'
import type { OrderWorkflowState } from '@/generated/prisma/enums'
import { cn } from '@/lib/utils'

export interface LabelRow {
  id: string
  orderNumber: string
  placedOn: string
  currencyCode: string
  recipientName: string
  phone: string | null
  destination: string | null
  codCents: number
  units: number
  workflowState: OrderWorkflowState
  courier: string | null
  consignmentId: string | null
  storeName: string | null
}

type Format = 'sticker' | 'invoice'

const NO_AREA = 'No area given'

/**
 * The packing bench.
 *
 * Not the order book with checkboxes bolted on — that is what this used to be,
 * and it answered the wrong questions. The physical job here is: pull parcels
 * for a van, sort them into piles by area, print a strip of stickers, hand the
 * pile to a rider and count the cash he owes you back. So:
 *
 *   - The headline is the **recipient**, not the order number. You are holding a
 *     box deciding whose it is.
 *   - The money is the **COD amount** — what the rider collects — not the order
 *     total. They differ on a part-paid order, and printing the total is how a
 *     rider ends up asking for money already taken.
 *   - Rows **group by area**, because that is the pile on the floor. Each pile
 *     selects in one press and carries its own cash subtotal.
 *   - The print controls live in a **bar pinned to the bottom of the screen**,
 *     not in a header a hundred rows above where you are working.
 *   - There is **no status dropdown**. Moving an order along mid-print is how a
 *     parcel is marked delivered before it leaves the building.
 *
 * Selection is the screen's whole purpose, so the entire row is the target.
 */
export function LabelList({
  rows,
  total,
}: {
  rows: LabelRow[]
  total: number
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<Format>('sticker')
  const [grouped, setGrouped] = useState(true)

  const currency = rows[0]?.currencyCode ?? 'BDT'

  // Piles, in the order a van gets loaded: biggest first, unaddressed last —
  // those need a human before they can go anywhere.
  const groups = useMemo(() => {
    const byArea = new Map<string, LabelRow[]>()
    for (const row of rows) {
      const area = row.destination ?? NO_AREA
      const bucket = byArea.get(area)
      if (bucket) bucket.push(row)
      else byArea.set(area, [row])
    }
    return [...byArea.entries()]
      .map(([area, items]) => ({
        area,
        items,
        codCents: items.reduce((sum, row) => sum + row.codCents, 0),
      }))
      .sort((a, b) => {
        if (a.area === NO_AREA) return 1
        if (b.area === NO_AREA) return -1
        return b.items.length - a.items.length
      })
  }, [rows])

  // One pile is not a pile. Grouping a single-area queue only adds a header.
  const showGroups = grouped && groups.length > 1

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectMany = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const chosen = rows.filter((row) => selected.has(row.id))
  const codTotal = chosen.reduce((sum, row) => sum + row.codCents, 0)

  const print = () => {
    if (chosen.length === 0) return
    // A new tab: the print dialog opens over it and the packer comes back here
    // with the selection intact, so the invoices for the same parcels are one
    // more press.
    window.open(
      `/print/orders?ids=${chosen.map((row) => row.id).join(',')}&format=${format}`,
      '_blank',
      'noopener'
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Bench header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            checked={allOnPage}
            indeterminate={!allOnPage && selected.size > 0}
            onCheckedChange={(checked) =>
              selectMany(
                rows.map((row) => row.id),
                Boolean(checked)
              )
            }
          />
          <span className="text-muted-foreground">
            {total} {total === 1 ? 'parcel' : 'parcels'} waiting
          </span>
        </label>

        {groups.length > 1 && (
          <Button
            type="button"
            size="sm"
            variant={grouped ? 'secondary' : 'ghost'}
            onClick={() => setGrouped((on) => !on)}
            aria-pressed={grouped}
          >
            <Layers />
            Group by area
          </Button>
        )}
      </div>

      {/* ── The queue ─────────────────────────────────────────────────── */}
      {showGroups ? (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const ids = group.items.map((row) => row.id)
            const allChosen = ids.every((id) => selected.has(id))

            return (
              <section
                key={group.area}
                className="bg-card ring-foreground/6 shadow-puck overflow-hidden rounded-xl ring-1"
              >
                <header className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <MapPin className="text-muted-foreground size-4" />
                    <span className="text-sm font-semibold">{group.area}</span>
                    <span className="text-muted-foreground text-sm">
                      {group.items.length}{' '}
                      {group.items.length === 1 ? 'parcel' : 'parcels'}
                      {group.codCents > 0 && (
                        <>
                          {' '}
                          · {formatMoney(group.codCents, currency)} to collect
                        </>
                      )}
                    </span>
                  </div>
                  {/* One press takes the whole pile. This is the action the
                      screen exists for — a rider covers an area, not a
                      scattering of order numbers. */}
                  <Button
                    type="button"
                    size="xs"
                    variant={allChosen ? 'secondary' : 'outline'}
                    onClick={() => selectMany(ids, !allChosen)}
                  >
                    {allChosen ? 'Deselect pile' : 'Select pile'}
                  </Button>
                </header>

                <div className="divide-border/60 divide-y">
                  {group.items.map((row) => (
                    <ParcelRow
                      key={row.id}
                      row={row}
                      selected={selected.has(row.id)}
                      onToggle={() => toggle(row.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="bg-card ring-foreground/6 shadow-puck divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl ring-1">
          {rows.map((row) => (
            <ParcelRow
              key={row.id}
              row={row}
              selected={selected.has(row.id)}
              onToggle={() => toggle(row.id)}
            />
          ))}
        </div>
      )}

      {/* ── The print bar ─────────────────────────────────────────────── */}
      {/*
        Pinned to the bottom of the viewport rather than sitting in a header.
        The queue runs to a hundred rows; a packer ticking the last of them
        should not have to scroll back to the top to press Print, and on the
        phone this market actually uses, the bottom of the screen is where the
        thumb already is.
      */}
      {chosen.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-1">
          <div className="bg-popover ring-foreground/10 shadow-puck flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1">
            <div className="text-sm">
              <span className="font-display text-base font-semibold">
                {chosen.length}
              </span>{' '}
              <span className="text-muted-foreground">
                {chosen.length === 1 ? 'parcel' : 'parcels'} selected
              </span>
              {/* What the van is carrying in cash. A packer handing parcels to
                  a rider counts this out, and doing that sum by hand off a list
                  of forty is where money goes missing. */}
              {codTotal > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <Money className="font-semibold">
                    {formatMoney(codTotal, currency)}
                  </Money>
                  <span className="text-muted-foreground"> to collect</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Format is a choice made once per run, so it is a switch that
                  holds its position rather than two competing buttons. */}
              <div
                role="radiogroup"
                aria-label="What to print"
                className="bg-muted flex items-center gap-0.5 rounded-full p-0.5"
              >
                {(
                  [
                    { key: 'sticker', label: 'Stickers', icon: Printer },
                    { key: 'invoice', label: 'Invoices', icon: Receipt },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={format === option.key}
                    onClick={() => setFormat(option.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      format === option.key
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <option.icon className="size-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>

              <Button type="button" onClick={print}>
                <Printer />
                Print {chosen.length}{' '}
                {format === 'sticker'
                  ? chosen.length === 1
                    ? 'sticker'
                    : 'stickers'
                  : chosen.length === 1
                    ? 'invoice'
                    : 'invoices'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
              >
                <X />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One parcel.
 *
 * The whole row toggles selection — that is this screen's one job, and hunting
 * a 16px box forty times is how a parcel gets missed. The overlay is a button
 * rather than a label so the order-number link inside stays independently
 * clickable.
 */
function ParcelRow({
  row,
  selected,
  onToggle,
}: {
  row: LabelRow
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        selected ? 'bg-lime/8' : 'hover:bg-muted/40'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`Select parcel for ${row.recipientName}, order ${row.orderNumber}`}
        className="absolute inset-0 cursor-pointer"
      />

      <div className="pointer-events-none relative flex min-w-0 flex-1 items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          tabIndex={-1}
          aria-hidden
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium">{row.recipientName}</span>
            {/* Context, not a control — see the note on the component above. */}
            <Badge variant="outline">
              {WORKFLOW_STATE_LABEL[row.workflowState]}
            </Badge>
            {row.courier && (
              <Badge variant="secondary">
                <Truck />
                {row.courier}
              </Badge>
            )}
            {row.storeName && <Badge variant="outline">{row.storeName}</Badge>}
          </div>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            {row.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" />
                {row.phone}
              </span>
            )}
            <span>
              {row.units} {row.units === 1 ? 'unit' : 'units'}
            </span>
            <span>{row.placedOn}</span>
          </div>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 text-xs">
            {/* Kept clickable above the row's selection overlay: the one reason
                to leave this screen is to go and check an order. */}
            <Link
              href={`/orders/${row.id}`}
              className="pointer-events-auto relative font-mono hover:underline"
            >
              {row.orderNumber}
            </Link>
            {row.consignmentId && (
              <span className="font-mono">Consignment {row.consignmentId}</span>
            )}
          </div>
        </div>
      </div>

      {/* What the rider collects, not what the order was worth. An already-paid
          parcel says so in words, because a courier who sees a number collects
          it. */}
      <div className="pointer-events-none relative shrink-0 text-right">
        {row.codCents > 0 ? (
          <>
            <Money className="text-base font-semibold">
              {formatMoney(row.codCents, row.currencyCode)}
            </Money>
            <p className="text-muted-foreground text-xs">to collect</p>
          </>
        ) : (
          <Badge variant="lime">Paid</Badge>
        )}
      </div>
    </div>
  )
}
