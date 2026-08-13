'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Check, Loader2, Package, Search, X } from 'lucide-react'
import { searchCatalogAction } from '@/app/(dashboard)/commerce-actions'
import type { PickerProduct } from '@/server/services/productService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatMoneyAmount } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Choosing a product, everywhere.
 *
 * Every place in the admin that picks a product used to do it with a bare
 * `<select>` of titles. That is fine until a real catalogue arrives: two
 * products called "Classic Tee", four hundred entries to scroll, and no way to
 * tell which one is the £19 one that is actually in stock. So this shows what a
 * person needs to identify a product — photo, price, category, stock, whether
 * it is live — and lets them search instead of scroll.
 *
 * Search runs on the server. Filtering a preloaded page in the browser looks
 * identical right up to the point where the catalogue is bigger than the page,
 * and then it silently cannot find things that exist — which is worse than no
 * search at all, because the merchant concludes the product is missing.
 */

export interface ProductPickerProps {
  /** First page of results, rendered before anyone types. */
  initialProducts: PickerProduct[]
  currencyCode: string
  /** Total matching the unsearched query, for "showing 60 of 412". */
  total?: number
}

/** Debounce for the search box: long enough to finish a word, short enough to feel live. */
const SEARCH_DELAY_MS = 250

function useCatalogSearch(
  initialProducts: PickerProduct[],
  options: { includeArchived?: boolean } = {}
) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerProduct[] | null>(null)
  // Every product this picker has seen, kept across searches so a selection
  // made before searching still renders — the current result set may no longer
  // contain it, and a chosen product that vanishes from the summary reads as
  // having been deselected.
  const [known, setKnown] = useState<Record<string, PickerProduct>>(() =>
    Object.fromEntries(initialProducts.map((product) => [product.id, product]))
  )
  const [pending, startTransition] = useTransition()

  // Guards against an earlier, slower response overwriting a later one — the
  // classic way a search box ends up showing results for a prefix of what is
  // in it.
  const latest = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') return

    const token = ++latest.current
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchCatalogAction(
          trimmed,
          options.includeArchived
        )
        if (token !== latest.current) return

        setResults(result.products)
        setKnown((current) => {
          const next = { ...current }
          for (const product of result.products) next[product.id] = product
          return next
        })
      })
    }, SEARCH_DELAY_MS)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialProducts is a stable server payload; including it would refetch on every parent render
  }, [query])

  // Derived rather than stored, so clearing the box needs no state update at
  // all. While a new search is in flight the previous results stay on screen
  // beside the spinner, rather than blanking to "nothing matches".
  const products =
    query.trim() === '' ? initialProducts : (results ?? initialProducts)

  return { query, setQuery, products, known, pending }
}

function SearchBox({
  query,
  onChange,
  pending,
  placeholder = 'Search by title, SKU or barcode',
}: {
  query: string
  onChange: (value: string) => void
  pending: boolean
  placeholder?: string
}) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search products"
        className="pl-9"
      />
      {pending && (
        <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
      )}
    </div>
  )
}

/** One product, with everything needed to tell it apart from a similar one. */
export function ProductRow({
  product,
  currencyCode,
  selected,
  onSelect,
  control,
  children,
}: {
  product: PickerProduct
  currencyCode: string
  selected: boolean
  onSelect: () => void
  control: 'checkbox' | 'radio' | 'none'
  children?: React.ReactNode
}) {
  const priceLabel =
    product.minPriceCents === product.maxPriceCents
      ? formatMoneyAmount(product.minPriceCents, currencyCode)
      : `${formatMoneyAmount(product.minPriceCents, currencyCode)} – ${formatMoneyAmount(product.maxPriceCents, currencyCode)}`

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
        selected ? 'bg-muted' : 'hover:bg-muted/60'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {control === 'checkbox' && (
          <Checkbox
            checked={selected}
            // The whole row is the click target; the box only reflects state,
            // so it must not also toggle and immediately undo the row's click.
            onCheckedChange={() => {}}
            tabIndex={-1}
            aria-hidden
          />
        )}
        {control === 'radio' && (
          <span
            className={cn(
              'flex size-4.5 shrink-0 items-center justify-center rounded-full border',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input'
            )}
            aria-hidden
          >
            {selected && <Check className="size-3 stroke-3" />}
          </span>
        )}

        <div className="bg-muted size-10 shrink-0 overflow-hidden rounded-md">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
            <img
              src={product.imageUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center">
              <Package className="size-4" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {priceLabel}
            {product.categoryName && ` · ${product.categoryName}`}
            {product.variants.length > 1 &&
              ` · ${product.variants.length} variants`}
            {product.tracksInventory
              ? ` · ${product.available} in stock`
              : ' · stock not tracked'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {product.status === 'DRAFT' && (
            <Badge variant="secondary">Draft</Badge>
          )}
          {product.tracksInventory && product.available <= 0 && (
            <Badge variant="destructive">Out</Badge>
          )}
        </div>
      </button>

      {children}
    </div>
  )
}

/**
 * Multi-select list, for a manual collection or a bulk action.
 *
 * Selected products are pinned to the top in their chosen order rather than
 * left scattered through the results, so "what have I picked" is answerable
 * without clearing the search first.
 */
export function ProductMultiPicker({
  initialProducts,
  currencyCode,
  selectedIds,
  onChange,
  emptyLabel = 'No products yet.',
}: ProductPickerProps & {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyLabel?: string
}) {
  const { query, setQuery, products, known, pending } =
    useCatalogSearch(initialProducts)

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => known[id])
        .filter((product): product is PickerProduct => Boolean(product)),
    [selectedIds, known]
  )

  const unselected = products.filter(
    (product) => !selectedIds.includes(product.id)
  )

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((candidate) => candidate !== id)
        : [...selectedIds, id]
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <SearchBox query={query} onChange={setQuery} pending={pending} />

      <div className="max-h-96 overflow-y-auto rounded-lg border p-1.5">
        {selected.length > 0 && (
          <>
            <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
              Selected ({selected.length})
            </p>
            {selected.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                currencyCode={currencyCode}
                selected
                control="checkbox"
                onSelect={() => toggle(product.id)}
              >
                <button
                  type="button"
                  onClick={() => toggle(product.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                  aria-label={`Remove ${product.title}`}
                >
                  <X className="size-4" />
                </button>
              </ProductRow>
            ))}
            <div className="my-1.5 border-t" />
          </>
        )}

        {unselected.length === 0 && selected.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            {query ? 'Nothing matches that search.' : emptyLabel}
          </p>
        ) : (
          unselected.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              currencyCode={currencyCode}
              selected={false}
              control="checkbox"
              onSelect={() => toggle(product.id)}
            />
          ))
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {selectedIds.length} selected. Order follows the sequence you pick them
        in.
      </p>
    </div>
  )
}

/**
 * Single-product picker behind a dialog, for panels too narrow for a list —
 * the builder inspector and the offers editor.
 */
export function ProductPickerDialog({
  initialProducts,
  currencyCode,
  onPick,
  trigger,
  title = 'Choose a product',
  /** When set, the dialog asks for a variant after the product is chosen. */
  pickVariant = false,
}: ProductPickerProps & {
  onPick: (productId: string, variantId: string | null) => void
  trigger: React.ReactNode
  title?: string
  pickVariant?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { query, setQuery, products, pending } =
    useCatalogSearch(initialProducts)

  function choose(product: PickerProduct) {
    // A product with one variant has nothing to disambiguate, so asking would
    // be a click that always has the same answer.
    if (pickVariant && product.variants.length > 1) {
      setExpanded((current) => (current === product.id ? null : product.id))
      return
    }

    onPick(product.id, pickVariant ? (product.variants[0]?.id ?? null) : null)
    setOpen(false)
    setExpanded(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <SearchBox query={query} onChange={setQuery} pending={pending} />

        <div className="max-h-[24rem] overflow-y-auto">
          {products.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {query
                ? 'Nothing matches that search.'
                : 'No products in this workspace yet.'}
            </p>
          ) : (
            products.map((product) => (
              <div key={product.id}>
                <ProductRow
                  product={product}
                  currencyCode={currencyCode}
                  selected={expanded === product.id}
                  control="none"
                  onSelect={() => choose(product)}
                />

                {expanded === product.id && (
                  <div className="ml-12 flex flex-col gap-1 border-l pb-2 pl-3">
                    {product.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => {
                          onPick(product.id, variant.id)
                          setOpen(false)
                          setExpanded(null)
                        }}
                        className="hover:bg-muted flex items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs"
                      >
                        <span className="truncate">
                          {variant.title}
                          {variant.sku && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {variant.sku}
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                          {formatMoneyAmount(variant.priceCents, currencyCode)}
                          {variant.tracksInventory &&
                            ` · ${variant.available} left`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  )
}
