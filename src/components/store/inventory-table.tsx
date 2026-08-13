'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, History, Loader2, Minus, Plus } from 'lucide-react'
import {
  adjustInventoryDeltaAction,
  inventoryHistoryAction,
  setVariantStockAction,
} from '@/app/(dashboard)/commerce-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/store/form-controls'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface InventoryTableRow {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  inventoryPolicy: 'DENY' | 'CONTINUE'
  productId: string
  productTitle: string
  imageUrl: string | null
  totalAvailable: number
  totalCommitted: number
  levels: {
    locationId: string
    locationName: string
    available: number
    committed: number
  }[]
}

interface HistoryEntry {
  id: string
  delta: number
  reason: string
  note: string | null
  referenceId: string | null
  createdAt: string
  locationName: string
}

/**
 * The stock table.
 *
 * Two ways to change a count, because merchants mean two different things:
 * "+12 arrived" is a receipt and "there are 40" is a stock take. Both are
 * offered inline on the row, and both land in the same ledger — the delta path
 * records what you typed, the count path records the difference it implies, so
 * the history reads as a sequence of movements either way.
 *
 * Editing happens on the row rather than behind a drawer because the work this
 * page exists for is going down a list correcting numbers, and a dialog per
 * variant turns twenty corrections into sixty clicks.
 */
export function InventoryTable({
  rows,
  locations,
  lowStockThreshold,
}: {
  rows: InventoryTableRow[]
  locations: { id: string; name: string }[]
  lowStockThreshold: number
}) {
  const [historyFor, setHistoryFor] = useState<InventoryTableRow | null>(null)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [, startTransition] = useTransition()

  function openHistory(row: InventoryTableRow) {
    setHistoryFor(row)
    setHistory(null)
    startTransition(async () => {
      setHistory(await inventoryHistoryAction(row.id))
    })
  }

  return (
    <>
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="divide-y">
          {rows.map((row) => (
            <InventoryRow
              key={row.id}
              row={row}
              locations={locations}
              lowStockThreshold={lowStockThreshold}
              onHistory={() => openHistory(row)}
            />
          ))}
        </div>
      </div>

      <Dialog
        open={historyFor !== null}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {historyFor?.productTitle}
              {historyFor && historyFor.title !== 'Default Title'
                ? ` — ${historyFor.title}`
                : ''}
            </DialogTitle>
          </DialogHeader>

          {history === null ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading movements…
            </p>
          ) : history.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No recorded movements yet.
            </p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto text-sm">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 py-2.5"
                >
                  <div>
                    <p className="font-medium">
                      {REASON_LABELS[entry.reason] ?? entry.reason}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(entry.createdAt).toLocaleString()} ·{' '}
                      {entry.locationName}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                  </div>
                  <span
                    className={
                      entry.delta > 0
                        ? 'font-mono text-sm text-emerald-600 tabular-nums'
                        : entry.delta < 0
                          ? 'text-destructive font-mono text-sm tabular-nums'
                          : 'text-muted-foreground font-mono text-sm tabular-nums'
                    }
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

const REASON_LABELS: Record<string, string> = {
  MANUAL: 'Manual change',
  ORDER_PLACED: 'Order placed',
  ORDER_CANCELLED: 'Order cancelled',
  FULFILLED: 'Fulfilled',
  RESTOCK: 'Restocked',
  REFUND: 'Refund returned',
  RECEIVED: 'Stock received',
  DAMAGED: 'Damaged / written off',
  CORRECTION: 'Stock take',
}

function InventoryRow({
  row,
  locations,
  lowStockThreshold,
  onHistory,
}: {
  row: InventoryTableRow
  locations: { id: string; name: string }[]
  lowStockThreshold: number
  onHistory: () => void
}) {
  const [count, setCount] = useState(String(row.totalAvailable))
  const [locationId, setLocationId] = useState(
    row.levels[0]?.locationId ?? locations[0]?.id ?? ''
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // A count only means something at one place. With several locations the row
  // shows each one and the box edits the selected one, so "set to 40" is never
  // ambiguous about which shelf holds the forty.
  const multiLocation = locations.length > 1
  const shownTotal = row.totalAvailable
  const dirty = count.trim() !== String(shownTotal)

  function run(action: () => Promise<{ error?: string } | undefined>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    })
  }

  function commitCount() {
    const parsed = Number(count)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a count of zero or more')
      return
    }
    run(() =>
      setVariantStockAction(
        row.id,
        Math.round(parsed),
        multiLocation ? locationId : undefined
      )
    )
  }

  function step(delta: number) {
    run(() => adjustInventoryDeltaAction(row.id, locationId, delta))
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="bg-muted size-11 shrink-0 overflow-hidden rounded-lg">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
            <img
              src={row.imageUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          )}
        </div>

        <div className="min-w-0">
          <Link
            href={`/products/${row.productId}`}
            className="font-medium hover:underline"
          >
            {row.productTitle}
          </Link>
          <p className="text-muted-foreground truncate text-xs">
            {row.title !== 'Default Title' && `${row.title} · `}
            {row.sku ? `SKU ${row.sku}` : 'No SKU'}
            {row.totalCommitted > 0 &&
              ` · ${row.totalCommitted} committed to orders`}
          </p>
          {/* Per-location counts, so a total of 12 is never a mystery about
              where the twelve are. */}
          {row.levels.length > 1 && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {row.levels
                .map((level) => `${level.locationName}: ${level.available}`)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {shownTotal <= 0 ? (
          <Badge variant="destructive">
            {row.inventoryPolicy === 'CONTINUE' ? 'Backorder' : 'Out of stock'}
          </Badge>
        ) : shownTotal <= lowStockThreshold ? (
          <Badge variant="secondary">Low</Badge>
        ) : null}

        {multiLocation && (
          <FormSelect
            value={locationId}
            aria-label="Location to adjust"
            className="h-9 w-36 text-xs"
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </FormSelect>
        )}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Remove one"
            disabled={pending}
            onClick={() => step(-1)}
          >
            <Minus />
          </Button>

          <Input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitCount()
              }
            }}
            inputMode="numeric"
            aria-label={`Stock for ${row.productTitle}`}
            className="h-9 w-20 text-center"
          />

          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Add one"
            disabled={pending}
            onClick={() => step(1)}
          >
            <Plus />
          </Button>
        </div>

        {dirty ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={commitCount}
          >
            {pending ? <Loader2 className="animate-spin" /> : 'Set'}
          </Button>
        ) : (
          saved && <Check className="size-4 text-emerald-600" />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Stock history"
          onClick={onHistory}
        >
          <History />
        </Button>
      </div>

      {error && (
        <p className="text-destructive w-full text-xs lg:w-auto">{error}</p>
      )}
    </div>
  )
}
