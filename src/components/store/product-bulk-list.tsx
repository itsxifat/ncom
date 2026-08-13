'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Copy, Loader2, MoreHorizontal, Package, X } from 'lucide-react'
import {
  bulkDeleteProductsAction,
  bulkProductStatusAction,
  duplicateProductAction,
} from '@/app/(dashboard)/commerce-actions'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProductStatusBadge } from '@/components/store/status-badges'
import { Money } from '@/components/store/form-controls'
import { formatMoney } from '@/lib/money'
import { Checkbox } from '@/components/ui/checkbox'
import { FormSelect } from '@/components/ui/form-select'
import { assignProductsToCategoryAction } from '@/app/(dashboard)/category-actions'

/**
 * The catalogue list, with selection and bulk actions.
 *
 * A real catalogue is edited in batches — a whole season goes live at once, a
 * whole supplier gets archived — and doing that one product at a time through
 * the editor is the difference between a tool a merchant uses and one they
 * work around.
 *
 * The rows are prepared on the server (prices, stock and thumbnails are all
 * derived from data this component never sees) and passed down flat, so this
 * stays a selection-and-dispatch layer rather than a second place where a
 * product's numbers get computed.
 */

export interface ProductListRow {
  id: string
  title: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  imageUrl: string | null
  categoryName: string | null
  variantCount: number
  /** Null when nothing on the product tracks stock. */
  stock: number | null
  minPriceCents: number
  maxPriceCents: number
}

export function ProductBulkList({
  rows,
  total,
  currencyCode,
  basePath,
  categories = [],
}: {
  rows: ProductListRow[]
  total: number
  currencyCode: string
  basePath: string
  /** The tree, flattened and indented, for the bulk filing control. */
  categories?: { id: string; label: string }[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error'
    text: string
  } | null>(null)
  const [pending, startTransition] = useTransition()

  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function run(
    action: () => Promise<{ error?: string; success?: string } | undefined>
  ) {
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) setMessage({ tone: 'error', text: result.error })
      else if (result?.success) {
        setMessage({ tone: 'ok', text: result.success })
        setSelected(new Set())
      }
    })
  }

  const ids = [...selected]

  return (
    <ListPanel>
      <ListPanelHeader>
        {selected.size === 0 ? (
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={false}
              onCheckedChange={() =>
                setSelected(new Set(rows.map((row) => row.id)))
              }

              aria-label="Select all products"
            />
            <span className="text-muted-foreground">
              {total} {total === 1 ? 'product' : 'products'}
            </span>
          </label>
        ) : (
          <div className="flex w-full flex-wrap items-center gap-2">
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(rows.map((row) => row.id))
                  )
                }

                aria-label="Select all products"
              />
              <span className="font-medium">{selected.size} selected</span>
            </label>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() => bulkProductStatusAction(ids, 'ACTIVE'))
                }
              >
                Publish
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => bulkProductStatusAction(ids, 'DRAFT'))}
              >
                Draft
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() => bulkProductStatusAction(ids, 'ARCHIVED'))
                }
              >
                Archive
              </Button>

              {/* Filing a season's worth of products one editor page at a time
                  is the single most tedious thing about setting up a catalogue,
                  so it is a bulk action rather than only a per-product field. */}
              {categories.length > 0 && (
                <FormSelect
                  value=""
                  aria-label="File selected products into a category"
                  className="h-9 w-48 text-xs"
                  placeholder="File into category…"
                  onChange={(event) => {
                    const value = event.target.value
                    if (!value) return
                    run(() =>
                      assignProductsToCategoryAction(
                        ids,
                        value === 'none' ? null : value
                      )
                    )
                  }}
                >
                  <option value="none">Remove from category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </FormSelect>
              )}

              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                className="text-destructive"
                onClick={() => {
                  // Deleting a catalogue row is not undoable and the button sits
                  // beside three that are, so it asks first.
                  if (
                    !window.confirm(
                      `Delete ${ids.length} product${ids.length === 1 ? '' : 's'}? Products that appear on an order will be kept.`
                    )
                  ) {
                    return
                  }
                  run(() => bulkDeleteProductsAction(ids))
                }}
              >
                Delete
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                title="Clear selection"
              >
                <X />
              </Button>
              {pending && (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              )}
            </div>
          </div>
        )}
      </ListPanelHeader>

      {message && (
        <div
          className={`px-4 py-2 text-sm ${
            message.tone === 'error' ? 'text-destructive' : 'text-emerald-600'
          }`}
        >
          {message.text}
        </div>
      )}

      {rows.map((row) => (
        <ListRow key={row.id}>
          <div className="flex min-w-0 items-center gap-3">
            <Checkbox
              checked={selected.has(row.id)}
              onCheckedChange={() => toggle(row.id)}
              className="shrink-0"
              aria-label={`Select ${row.title}`}
            />
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
              <img
                src={row.imageUrl}
                alt=""
                className="bg-muted size-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Package className="text-muted-foreground size-4" />
              </div>
            )}
            <ListRowText
              title={
                <Link
                  href={`${basePath}/${row.id}`}
                  className="hover:underline"
                >
                  {row.title}
                </Link>
              }
              meta={
                <>
                  {row.variantCount}{' '}
                  {row.variantCount === 1 ? 'variant' : 'variants'}
                  {row.stock !== null && ` · ${row.stock} in stock`}
                  {row.categoryName
                    ? ` · ${row.categoryName}`
                    : ' · no category'}
                  {row.imageUrl === null && ' · no photo'}
                </>
              }
              badges={<ProductStatusBadge status={row.status} />}
            />
          </div>

          <ListRowActions>
            <Money>
              {row.minPriceCents === row.maxPriceCents
                ? formatMoney(row.minPriceCents, currencyCode)
                : `${formatMoney(row.minPriceCents, currencyCode)} – ${formatMoney(row.maxPriceCents, currencyCode)}`}
            </Money>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" title="More actions">
                    <MoreHorizontal />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    startTransition(async () => {
                      await duplicateProductAction(row.id)
                    })
                  }
                >
                  <Copy /> Duplicate
                </DropdownMenuItem>
                {row.status !== 'ACTIVE' && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(() => bulkProductStatusAction([row.id], 'ACTIVE'))
                    }
                  >
                    Publish
                  </DropdownMenuItem>
                )}
                {row.status !== 'ARCHIVED' && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(() => bulkProductStatusAction([row.id], 'ARCHIVED'))
                    }
                  >
                    Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </ListRowActions>
        </ListRow>
      ))}
    </ListPanel>
  )
}
