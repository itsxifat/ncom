'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The expand/collapse half of the FAQ block.
 *
 * One open item at a time, which is what makes a long list scannable on a
 * phone — the answer the buyer opened stays in view instead of being pushed
 * off-screen by everything they opened before it.
 */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(-1)

  return (
    <div className="mx-auto max-w-2xl divide-y divide-black/[0.07] border-y border-black/[0.07]">
      {items.map((it, i) => (
        <div key={i}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? -1 : i)}
            className="flex w-full items-center justify-between gap-4 py-4 text-left"
            aria-expanded={open === i}
          >
            <span className="text-[14px] font-medium text-[color:var(--lp-text)]">
              {it.q}
            </span>
            <ChevronDown
              size={16}
              className={cn(
                'flex-shrink-0 text-[color:var(--lp-text)]/40 transition-transform',
                open === i && 'rotate-180'
              )}
            />
          </button>
          {open === i && (
            <p className="pb-4 text-[13px] leading-relaxed whitespace-pre-line text-[color:var(--lp-text)]/65">
              {it.a}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
