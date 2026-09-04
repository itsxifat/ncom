import Link from 'next/link'
import { ExternalLink, Infinity as InfinityIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface InventoryTableRow {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  policy: 'DENY' | 'CONTINUE'
  productId: string
  productTitle: string
  imageUrl: string | null
  /** Null when the merchant's site does not count this line. */
  available: number | null
}

/**
 * The stock table, which no longer edits anything.
 *
 * It used to: two ways to change a count, inline on the row, because "+12
 * arrived" and "there are 40" are different sentences a merchant says. Both are
 * gone, and their absence is the point. The numbers on this screen live in the
 * merchant's own system — the one their warehouse staff, their POS and their
 * accountant already use — and a second place to type them would be a second
 * answer to "how many are there", which is the exact problem this platform
 * stopped having.
 *
 * So the row links out to the product on their site instead. One number, one
 * owner, and a page that is honest about which one it is.
 *
 * A server component: with nothing to click there is nothing to hydrate.
 */
export function InventoryTable({
  rows,
  lowStockThreshold,
  productUrl,
}: {
  rows: InventoryTableRow[]
  lowStockThreshold: number
  productUrl?: (row: InventoryTableRow) => string | null
}) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="divide-y">
        {rows.map((row) => {
          const href = productUrl?.(row) ?? null

          return (
            <div
              key={row.id}
              className="flex items-center gap-4 px-4 py-3 text-sm"
            >
              {row.imageUrl ? (
                // Not next/image: these URLs are on the merchant's own domain,
                // which is different for every tenant and unknowable at build
                // time, so there is no remote pattern that could cover them.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.imageUrl}
                  alt=""
                  className="bg-muted size-10 shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="bg-muted size-10 shrink-0 rounded" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.productTitle}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {row.title !== 'Default Title' ? `${row.title} · ` : ''}
                  {row.sku ?? 'No SKU'}
                </p>
              </div>

              <StockBadge row={row} lowStockThreshold={lowStockThreshold} />

              {href && (
                <Link
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={`Open ${row.productTitle} on your website`}
                >
                  <ExternalLink className="size-4" />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StockBadge({
  row,
  lowStockThreshold,
}: {
  row: InventoryTableRow
  lowStockThreshold: number
}) {
  // Untracked is not zero and must never render as one. A site that does not
  // count a line is saying it always has it, and showing "0" beside real counts
  // would send a merchant hunting for stock that was never missing.
  if (row.available === null) {
    return (
      <Badge variant="outline" className="shrink-0 gap-1">
        <InfinityIcon className="size-3" />
        Not counted
      </Badge>
    )
  }

  if (row.available <= 0) {
    return (
      <Badge variant="destructive" className="shrink-0">
        {row.policy === 'CONTINUE' ? 'Out — backorder' : 'Out of stock'}
      </Badge>
    )
  }

  return (
    <Badge
      variant={row.available <= lowStockThreshold ? 'secondary' : 'outline'}
      className="shrink-0 font-mono tabular-nums"
    >
      {row.available}
    </Badge>
  )
}
