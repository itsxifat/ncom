'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

/**
 * The strip above a print run, and the print dialog itself.
 *
 * Opening the dialog automatically is the whole reason this is a client
 * component: the merchant clicked "Print stickers" on the orders list, this tab
 * opened, and asking them to press a second print button in a new tab they did
 * not ask to read is a step with no decision in it.
 *
 * It fires once, on mount, and only when there is something to print. Guarded
 * because a `window.print()` on an empty page opens a dialog for a blank sheet,
 * which people confirm by reflex and then wonder where the labels went.
 */
export function PrintToolbar({
  count,
  format,
  ids,
}: {
  count: number
  format: 'sticker' | 'invoice'
  /** Passed down rather than read back off `window`, which does not exist
      during the server render of this client component. */
  ids: string[]
}) {
  useEffect(() => {
    if (count === 0) return

    // A frame, so the barcodes and images are laid out before the dialog
    // snapshots the page.
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [count])

  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3 text-neutral-900">
      <div className="text-sm">
        <strong className="font-semibold">
          {count} {format === 'sticker' ? 'parcel sticker' : 'invoice'}
          {count === 1 ? '' : 's'}
        </strong>
        <span className="text-neutral-500">
          {' '}
          ·{' '}
          {format === 'sticker'
            ? 'sized for 4×6 thermal paper'
            : 'sized for A4'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <a
          href={`?${new URLSearchParams({
            ids: ids.join(','),
            format: format === 'sticker' ? 'invoice' : 'sticker',
          })}`}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Switch to {format === 'sticker' ? 'invoices' : 'stickers'}
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          <Printer className="size-4" />
          Print
        </button>
      </div>
    </div>
  )
}
