'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'

/** The strip above an invoice: back to billing, and print (or save as PDF). */
export function InvoiceToolbar({
  number,
  backHref,
}: {
  number: string
  backHref: string
}) {
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 text-neutral-900 sm:px-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-sm text-neutral-500 sm:inline">
          {number}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          <Printer className="size-4" />
          Print or save as PDF
        </button>
      </div>
    </div>
  )
}
