'use client'

import { cn } from '@/lib/utils'
import { useStoreText } from './StoreTextProvider'

/**
 * A price with its old price beside it, when there is one.
 *
 * The struck-through figure is only drawn when it is genuinely higher: a
 * compare-at price equal to the price is a data-entry leftover, and showing
 * "৳850 ~~৳850~~" reads as a broken sale.
 *
 * A client component only to read the storefront's language — "From", and
 * whether the digits are written ১,২৫০ — from the page it is drawn in, which
 * is what lets a product card show the same price on the server and on the
 * builder canvas.
 */
export function Price({
  cents,
  compareAtCents,
  currencyCode,
  from = false,
  className,
  compareClassName,
}: {
  cents: number
  compareAtCents?: number | null
  currencyCode: string
  /** Prefix "From" — the cheapest of several prices. */
  from?: boolean
  className?: string
  compareClassName?: string
}) {
  const { words, price } = useStoreText()
  const onSale = Boolean(compareAtCents && compareAtCents > cents)
  return (
    <span
      className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}
    >
      <span className={onSale ? 'text-[var(--page-primary)]' : undefined}>
        {from && <span className="font-normal opacity-70">{words.from} </span>}
        {price(cents, currencyCode)}
      </span>
      {onSale && (
        <s
          className={cn(
            'text-[0.85em] font-normal opacity-55',
            compareClassName
          )}
        >
          {price(compareAtCents!, currencyCode)}
        </s>
      )}
    </span>
  )
}
