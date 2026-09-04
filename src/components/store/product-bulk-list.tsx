'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Archive,
  Copy,
  ExternalLink,
  Eye,
  FileEdit,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
 *
 * Two catalogues share the list. Rows NCOM stores get a checkbox and the whole
 * menu; rows read live from the merchant's own website get a badge and a link
 * out, because every action here writes to a table those products are not in.
 * They are shown rather than hidden so that "what am I selling" has one answer
 * — and the checkbox column is where the difference is legible without reading
 * a single badge.
 */

export interface ProductListRow {
  /** Which catalogue the row came from. Only `LOCAL` rows can be acted on. */
  source: 'LOCAL' | 'REMOTE'
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
  /** The product's page on the merchant's own site, when it has one. */
  url: string | null
}

type Message = {
  tone: 'ok' | 'error'
  text: string
  /** Products a delete refused, offered back as a one-click archive. */
  blockedIds?: string[]
}

export function ProductBulkList({
  rows,
  total,
  currencyCode,
  basePath,
  categories = [],
}: {
  rows: ProductListRow[]
  /**
   * How many products match, when that is knowable. Null when a connected
   * website does not count — the list then reports what it is showing rather
   * than inventing a total it would be wrong about.
   */
  total: number | null
  currencyCode: string
  basePath: string
  /** The tree, flattened and indented, for the bulk filing control. */
  categories?: { id: string; label: string }[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<Message | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<
    ProductListRow[] | null
  >(null)
  const [pending, startTransition] = useTransition()

  // Selection is only ever over the rows this screen can actually change, so
  // every count, every "select all" and every bulk call is derived from these
  // rather than from `rows`. Without that, "12 selected" could include four
  // products on the merchant's website and the archive button would silently
  // do eight.
  const ownRows = useMemo(
    () => rows.filter((row) => row.source === 'LOCAL'),
    [rows]
  )
  const remoteCount = rows.length - ownRows.length

  const allSelected = ownRows.length > 0 && selected.size === ownRows.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(ownRows.map((row) => row.id)))
  }

  function run(
    action: () => Promise<
      { error?: string; success?: string; blockedIds?: string[] } | undefined
    >
  ) {
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setMessage({
          tone: 'error',
          text: result.error,
          blockedIds: result.blockedIds,
        })
        return
      }
      if (result?.success) {
        setMessage({ tone: 'ok', text: result.success })
        setSelected(new Set())
      }
    })
  }

  const ids = [...selected]
  const selectedRows = ownRows.filter((row) => selected.has(row.id))

  return (
    <>
      <ListPanel>
        <ListPanelHeader>
          {selected.size === 0 ? (
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={false}
                onCheckedChange={selectAll}
                disabled={ownRows.length === 0}
                aria-label="Select all products stored in NCOM"
              />
              <span className="text-muted-foreground">
                {total === null
                  ? `${rows.length} shown`
                  : `${total} ${total === 1 ? 'product' : 'products'}`}
                {remoteCount > 0 && ownRows.length > 0 && (
                  <> · {ownRows.length} you can edit here</>
                )}
              </span>
            </label>
          ) : (
            <div className="flex w-full flex-wrap items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() =>
                    allSelected ? setSelected(new Set()) : selectAll()
                  }
                  aria-label="Select all products stored in NCOM"
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
                  <Eye />
                  Publish
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => bulkProductStatusAction(ids, 'DRAFT'))
                  }
                >
                  <FileEdit />
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
                  <Archive />
                  Archive
                </Button>

                {/* Filing a season's worth of products one editor page at a
                    time is the single most tedious thing about setting up a
                    catalogue, so it is a bulk action rather than only a
                    per-product field. */}
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
                  onClick={() => setConfirmingDelete(selectedRows)}
                >
                  <Trash2 />
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
            className={`flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm sm:px-6 ${
              message.tone === 'error' ? 'text-destructive' : 'text-emerald-600'
            }`}
          >
            <span>{message.text}</span>
            {message.blockedIds && message.blockedIds.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    bulkProductStatusAction(message.blockedIds!, 'ARCHIVED')
                  )
                }
              >
                <Archive />
                Archive those {message.blockedIds.length} instead
              </Button>
            )}
          </div>
        )}

        {rows.map((row) => {
          const own = row.source === 'LOCAL'

          return (
            <ListRow key={`${row.source}:${row.id}`}>
              <div className="flex min-w-0 items-center gap-3">
                {own ? (
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggle(row.id)}
                    className="shrink-0"
                    aria-label={`Select ${row.title}`}
                  />
                ) : (
                  // Holds the column so the two kinds of row stay aligned. The
                  // gap is the point: it is what makes an unselectable row read
                  // as unselectable rather than as a missed click.
                  <span className="size-4 shrink-0" aria-hidden />
                )}
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN and merchant-domain URLs aren't in next/image's remote allowlist
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="bg-muted size-10 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Package className="text-muted-foreground size-4" />
                  </div>
                )}
                <ListRowText
                  title={
                    <Link
                      href={`${basePath}/${encodeURIComponent(row.id)}`}
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
                      {own
                        ? row.categoryName
                          ? ` · ${row.categoryName}`
                          : ' · no category'
                        : row.categoryName
                          ? ` · ${row.categoryName}`
                          : ''}
                      {own && row.imageUrl === null && ' · no photo'}
                    </>
                  }
                  badges={
                    <>
                      <ProductStatusBadge status={row.status} />
                      {!own && (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Your website
                        </Badge>
                      )}
                    </>
                  }
                />
              </div>

              <ListRowActions>
                <Money>
                  {row.minPriceCents === row.maxPriceCents
                    ? formatMoney(row.minPriceCents, currencyCode)
                    : `${formatMoney(row.minPriceCents, currencyCode)} – ${formatMoney(row.maxPriceCents, currencyCode)}`}
                </Money>

                {own ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={`Actions for ${row.title}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={
                          <Link
                            href={`${basePath}/${encodeURIComponent(row.id)}`}
                          />
                        }
                      >
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          startTransition(async () => {
                            await duplicateProductAction(row.id)
                          })
                        }
                      >
                        <Copy /> Duplicate
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {row.status !== 'ACTIVE' && (
                        <DropdownMenuItem
                          onClick={() =>
                            run(() =>
                              bulkProductStatusAction([row.id], 'ACTIVE')
                            )
                          }
                        >
                          <Eye /> Publish
                        </DropdownMenuItem>
                      )}
                      {row.status !== 'DRAFT' && (
                        <DropdownMenuItem
                          onClick={() =>
                            run(() =>
                              bulkProductStatusAction([row.id], 'DRAFT')
                            )
                          }
                        >
                          <FileEdit /> Move to draft
                        </DropdownMenuItem>
                      )}
                      {row.status !== 'ARCHIVED' && (
                        <DropdownMenuItem
                          onClick={() =>
                            run(() =>
                              bulkProductStatusAction([row.id], 'ARCHIVED')
                            )
                          }
                        >
                          <Archive /> Archive
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmingDelete([row])}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : row.url ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    title={`Open ${row.title} on your website`}
                    render={
                      <a href={row.url} target="_blank" rel="noreferrer">
                        <ExternalLink />
                      </a>
                    }
                  />
                ) : (
                  <span className="size-8" aria-hidden />
                )}
              </ListRowActions>
            </ListRow>
          )
        })}
      </ListPanel>

      <DeleteProductsDialog
        rows={confirmingDelete}
        pending={pending}
        onCancel={() => setConfirmingDelete(null)}
        onConfirm={(targets) => {
          setConfirmingDelete(null)
          run(() => bulkDeleteProductsAction(targets.map((row) => row.id)))
        }}
        onArchive={(targets) => {
          setConfirmingDelete(null)
          run(() =>
            bulkProductStatusAction(
              targets.map((row) => row.id),
              'ARCHIVED'
            )
          )
        }}
      />
    </>
  )
}

/**
 * Confirms a delete, and offers the thing the merchant usually meant.
 *
 * Deleting a product is not undoable and archiving nearly always is what was
 * wanted — the product stops being sold, its orders keep their history, and it
 * can come back. Both are offered here rather than making archive a second trip
 * through the menu, and the destructive one is not the default button.
 *
 * A browser `confirm()` would be shorter and is what this used to be. It also
 * blocks the whole tab, cannot say which products it is about to destroy, and
 * on a list of forty similar shirts "Delete 6 products?" is not enough
 * information to answer.
 */
function DeleteProductsDialog({
  rows,
  pending,
  onCancel,
  onConfirm,
  onArchive,
}: {
  rows: ProductListRow[] | null
  pending: boolean
  onCancel: () => void
  onConfirm: (rows: ProductListRow[]) => void
  onArchive: (rows: ProductListRow[]) => void
}) {
  const targets = rows ?? []
  const count = targets.length

  return (
    <Dialog
      open={rows !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count === 1
              ? `Delete “${targets[0]?.title}”?`
              : `Delete ${count} products?`}
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Anything that has already sold is kept
            instead — an order has to keep pointing at what it sold.
          </DialogDescription>
        </DialogHeader>

        {count > 1 && (
          <ul className="text-muted-foreground max-h-40 overflow-y-auto text-sm">
            {targets.slice(0, 12).map((row) => (
              <li key={row.id} className="truncate">
                {row.title}
              </li>
            ))}
            {count > 12 && <li>and {count - 12} more</li>}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onArchive(targets)}
          >
            <Archive />
            Archive instead — keeps {count === 1 ? 'it' : 'them'} and the
            history
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(targets)}
          >
            <Trash2 />
            Delete permanently
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
