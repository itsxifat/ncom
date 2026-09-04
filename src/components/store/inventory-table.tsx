import Link from 'next/link'
import { ExternalLink, Infinity as InfinityIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { VariantStockInput } from '@/components/store/variant-stock-input'

export interface InventoryTableRow {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  policy: 'DENY' | 'CONTINUE'
  productId: string
  productTitle: string
  imageUrl: string | null
  /** Null when nothing counts this line. */
  available: number | null
  /** Which catalogue owns the number, and therefore who may change it. */
  source: 'LOCAL' | 'REMOTE'
}

/**
 * The stock table, over both catalogues.
 *
 * A row for one of NCOM's own products is editable inline: type the count you
 * counted. A row read from the merchant's website is not, and shows where the
 * number lives instead — their warehouse staff, their POS and their accountant
 * already use that system, and a second place to type the figure would be a
 * second answer to "how many are there", which is the exact problem a live read
 * exists to avoid.
 *
 * So the difference between the two halves of this table is a text box. That is
 * the whole of it, and it is deliberate that it is visible at a glance.
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

              {/* Untracked local variants have no count to type, so they get
                  the badge like a remote row does. */}
              {row.source === 'LOCAL' && row.available !== null ? (
                <VariantStockInput variantId={row.id} initial={row.available} />
              ) : (
                <StockBadge row={row} lowStockThreshold={lowStockThreshold} />
              )}

              <Badge
                variant="outline"
                className="text-muted-foreground shrink-0"
              >
                {row.source === 'LOCAL' ? 'In NCOM' : 'Your website'}
              </Badge>

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
