'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, Package, Search, X } from 'lucide-react'
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
 *
 * The list is **paged, not capped**. It used to render one server-rendered page
 * and stop, so a shop of six hundred products offered sixty of them and the
 * rest could not be put in an offer at all. Reaching the end of the list now
 * fetches the next page, and keeps doing it until the catalogue runs out —
 * which is also why the whole catalogue is never requested at once: half of it
 * is read live from the merchant's own website.
 */

export interface ProductPickerProps {
  /** First page of results, rendered before anyone types. */
  initialProducts: PickerProduct[]
  currencyCode: string
  /**
   * Where the second page of the unsearched catalogue starts. Null — or
   * omitted — means the first page was the whole of it.
   */
  initialCursor?: string | null
  /** Total matching the unsearched query, for "showing 60 of 412". */
  total?: number | null
}

/** Debounce for the search box: long enough to finish a word, short enough to feel live. */
const SEARCH_DELAY_MS = 250

/** One page of the catalogue, and where the next one starts. */
interface CatalogPage {
  products: PickerProduct[]
  cursor: string | null
}

function appendPage(page: CatalogPage, next: CatalogPage): CatalogPage {
  const seen = new Set(page.products.map((product) => product.id))

  return {
    // Deduplicated because the two catalogues page independently, and a site
    // whose cursor overlaps by a row would otherwise render it twice and hand
    // React two children with the same key.
    products: [
      ...page.products,
      ...next.products.filter((product) => !seen.has(product.id)),
    ],
    cursor: next.cursor,
  }
}

function useCatalogSearch(
  initialProducts: PickerProduct[],
  options: {
    includeArchived?: boolean
    initialCursor?: string | null
    total?: number | null
  } = {}
) {
  const [query, setQuery] = useState('')
  // Pages fetched past the first one. The first stays a prop rather than being
  // copied into state, so a fresh server payload — a saved product, a form
  // hydrating a reference it was holding — flows straight through.
  const [more, setMore] = useState<CatalogPage>(() => ({
    products: [],
    cursor: options.initialCursor ?? null,
  }))
  const [results, setResults] = useState<CatalogPage | null>(null)
  // What the whole catalogue holds, as against the page of it on screen. Null
  // whenever a connected website did not count its half, which is honest and
  // common — so the footer says "showing 60" rather than inventing a total.
  const [searchTotal, setSearchTotal] = useState<number | null>(null)
  // Every product any of these fetches has returned, kept so that a selection
  // made before searching still renders: the current result set may no longer
  // contain it, and a chosen product that vanishes from the summary reads as
  // having been deselected.
  const [fetched, setFetched] = useState<Record<string, PickerProduct>>({})

  const [pending, startTransition] = useTransition()
  const [loadingMore, setLoadingMore] = useState(false)

  // Guards against an earlier, slower response overwriting a later one — the
  // classic way a search box ends up showing results for a prefix of what is
  // in it. A page still in flight when the query changes is dropped for the
  // same reason.
  const latest = useRef(0)
  const loading = useRef(false)

  const remember = useCallback((products: PickerProduct[]) => {
    if (products.length === 0) return
    setFetched((current) => {
      const next = { ...current }
      for (const product of products) next[product.id] = product
      return next
    })
  }, [])

  const searching = query.trim() !== ''

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') return

    const token = ++latest.current
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchCatalogAction(trimmed, {
          includeArchived: options.includeArchived,
        })
        if (token !== latest.current) return

        setResults({ products: result.products, cursor: result.nextCursor })
        setSearchTotal(result.total)
        remember(result.products)
      })
    }, SEARCH_DELAY_MS)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- includeArchived never changes for a mounted picker, and remember is stable
  }, [query])

  const browse = useMemo<CatalogPage>(
    () => appendPage({ products: initialProducts, cursor: null }, more),
    [initialProducts, more]
  )

  // Derived rather than stored, so clearing the box needs no state update at
  // all. While a new search is in flight the previous results stay on screen
  // beside the spinner, rather than blanking to "nothing matches".
  const page = searching ? (results ?? browse) : browse

  const known = useMemo(() => {
    const out: Record<string, PickerProduct> = { ...fetched }
    for (const product of initialProducts) out[product.id] = product
    return out
  }, [initialProducts, fetched])

  const loadMore = useCallback(() => {
    if (loading.current || page.cursor === null) return

    const token = latest.current
    const term = searching ? query.trim() : ''
    loading.current = true
    setLoadingMore(true)

    void searchCatalogAction(term, {
      includeArchived: options.includeArchived,
      cursor: page.cursor,
    })
      .then((result) => {
        // A search started while this page was in flight owns the list now.
        if (token !== latest.current) return

        const next = { products: result.products, cursor: result.nextCursor }
        if (term === '') setMore((current) => appendPage(current, next))
        else setResults((current) => appendPage(current ?? next, next))
        remember(result.products)
      })
      .finally(() => {
        loading.current = false
        setLoadingMore(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- includeArchived never changes for a mounted picker
  }, [page.cursor, query, searching, remember])

  return {
    query,
    setQuery,
    products: page.products,
    known,
    remember,
    pending,
    hasMore: page.cursor !== null,
    loadingMore,
    loadMore,
    total: searching ? searchTotal : (options.total ?? null),
  }
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

/**
 * The bottom of a paged list: fetches the next page when it scrolls into view.
 *
 * An observer rather than only a button because the gesture a merchant makes
 * when a list does not hold what they want is to scroll, not to look for a
 * control. The button stays for the same reason a keyboard user exists.
 */
function LoadMore({
  hasMore,
  loading,
  onLoad,
}: {
  hasMore: boolean
  loading: boolean
  onLoad: () => void
}) {
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = sentinel.current
    if (!hasMore || loading || !node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoad()
      },
      // A little early, so the next page is usually there by the time the
      // merchant reaches the end of this one.
      { rootMargin: '160px' }
    )
    observer.observe(node)

    return () => observer.disconnect()
  }, [hasMore, loading, onLoad])

  if (!hasMore) return null

  return (
    <div ref={sentinel} className="p-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground w-full"
        disabled={loading}
        onClick={onLoad}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Loading more…
          </>
        ) : (
          <>
            <ChevronDown />
            Load more products
          </>
        )}
      </Button>
    </div>
  )
}

/** How wide the hover preview is, in pixels. */
const PREVIEW_SIZE = 288

/**
 * Where the enlarged photo goes: beside the thumbnail, to its left by
 * preference.
 *
 * Left, because a thumbnail sits at the left edge of its row and everything to
 * the right of it is the product's name, price and stock — the things being
 * compared against the photo. A preview that covers them answers one question
 * by hiding the others.
 */
function previewPosition(anchor: DOMRect): { left: number; top: number } {
  const gap = 12
  const onTheLeft = anchor.left - gap - PREVIEW_SIZE

  return {
    left:
      onTheLeft >= gap
        ? onTheLeft
        : Math.min(anchor.right + gap, window.innerWidth - PREVIEW_SIZE - gap),
    top: Math.min(
      Math.max(gap, anchor.top + anchor.height / 2 - PREVIEW_SIZE / 2),
      Math.max(gap, window.innerHeight - PREVIEW_SIZE - gap)
    ),
  }
}

/**
 * A product's photo, at a size a person can actually recognise.
 *
 * A 40px square of a product photo is not enough to tell two colourways of the
 * same shirt apart, which is the exact moment a merchant is looking at it. So
 * the thumbnail is 64px, and hovering it shows the photo at 288px.
 *
 * The enlarged one is portalled to the body. Every list this row appears in is
 * a scroll container — and two of them are inside a dialog — so a preview
 * positioned within the row would be clipped by the first ancestor with
 * `overflow: hidden` and appear as a sliver or not at all.
 */
function ProductThumb({
  product,
  className,
}: {
  product: PickerProduct
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!anchor) return

    // A preview is positioned once, against where the thumbnail was. Scrolling
    // the list underneath it would leave it pointing at a different product.
    const close = () => setAnchor(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchor])

  const showPreview = anchor !== null && product.imageUrl !== null

  return (
    <div
      ref={box}
      // Touch has no hover, and a tap here means "choose this product" — so the
      // preview is for pointing devices only.
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse' || !product.imageUrl) return
        setAnchor(box.current?.getBoundingClientRect() ?? null)
      }}
      onPointerLeave={() => setAnchor(null)}
      className={cn(
        'bg-muted size-16 shrink-0 overflow-hidden rounded-md',
        className
      )}
    >
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
          <Package className="size-5" />
        </span>
      )}

      {showPreview &&
        createPortal(
          <div
            role="presentation"
            data-slot="product-preview"
            style={{
              ...previewPosition(anchor),
              width: PREVIEW_SIZE,
            }}
            className="bg-popover ring-foreground/10 pointer-events-none fixed z-100 flex flex-col gap-1 rounded-xl p-1.5 shadow-xl ring-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist */}
            <img
              src={product.imageUrl ?? ''}
              alt=""
              className="bg-muted h-64 w-full rounded-lg object-contain"
            />
            <p className="text-popover-foreground truncate px-1 pb-0.5 text-xs font-medium">
              {product.title}
            </p>
          </div>,
          document.body
        )}
    </div>
  )
}

/**
 * "Showing 60 of 412" — or just "showing 60" when the total is unknowable.
 *
 * A connected website that does not count its own catalogue cannot be counted
 * for it, and a made-up total is worse than none: it is what tells a merchant
 * whether the product they cannot find is missing or merely further down.
 */
function CatalogCount({
  shown,
  total,
}: {
  shown: number
  total: number | null
}) {
  return (
    <span>
      Showing {shown}
      {total !== null && total > shown ? ` of ${total}` : ''}.
    </span>
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

        <ProductThumb product={product} />

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
  initialCursor,
  total: initialTotal,
  currencyCode,
  selectedIds,
  onChange,
  emptyLabel = 'No products yet.',
  includeArchived,
}: ProductPickerProps & {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyLabel?: string
  includeArchived?: boolean
}) {
  const {
    query,
    setQuery,
    products,
    known,
    pending,
    hasMore,
    loadingMore,
    loadMore,
    total,
  } = useCatalogSearch(initialProducts, {
    initialCursor,
    includeArchived,
    total: initialTotal,
  })

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

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border p-1.5">
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

        <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
      </div>

      <p className="text-muted-foreground text-xs">
        {selectedIds.length} selected. Order follows the sequence you pick them
        in. <CatalogCount shown={products.length} total={total} />
      </p>
    </div>
  )
}

/**
 * Multi-select down to the size, for rules that are about sizes.
 *
 * Grouped by product rather than shown as one flat list of "Shirt · L" rows,
 * because a catalogue of four hundred products has thousands of sizes and the
 * question being answered is always "which sizes of *this* product". The chosen
 * ones are pinned above the catalogue as chips, so a rule built over several
 * products can be read back without opening any of them.
 */
export function VariantMultiPicker({
  initialProducts,
  initialCursor,
  total: initialTotal,
  currencyCode,
  selectedIds,
  onChange,
  emptyLabel = 'No products yet.',
}: ProductPickerProps & {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyLabel?: string
}) {
  const {
    query,
    setQuery,
    products,
    known,
    pending,
    hasMore,
    loadingMore,
    loadMore,
    total,
  } = useCatalogSearch(initialProducts, {
    initialCursor,
    includeArchived: true,
    total: initialTotal,
  })
  const [expanded, setExpanded] = useState<string | null>(null)

  /** Every known size, by id, so a saved selection can name itself. */
  const sizes = useMemo(() => {
    const out = new Map<string, { product: string; title: string }>()
    for (const product of Object.values(known)) {
      for (const variant of product.variants) {
        out.set(variant.id, { product: product.title, title: variant.title })
      }
    }
    return out
  }, [known])

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

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const size = sizes.get(id)
            return (
              <span
                key={id}
                className="bg-muted flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-xs"
              >
                {size ? `${size.product} · ${size.title}` : id}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${size ? `${size.product} ${size.title}` : id}`}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border p-1.5">
        {products.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            {query ? 'Nothing matches that search.' : emptyLabel}
          </p>
        ) : (
          products.map((product) => {
            const chosen = product.variants.filter((variant) =>
              selectedIds.includes(variant.id)
            ).length
            const isOpen = expanded === product.id

            return (
              <div key={product.id}>
                <ProductRow
                  product={product}
                  currencyCode={currencyCode}
                  selected={chosen > 0}
                  control="none"
                  onSelect={() =>
                    setExpanded((current) =>
                      current === product.id ? null : product.id
                    )
                  }
                >
                  <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                    {chosen > 0
                      ? `${chosen} of ${product.variants.length} chosen`
                      : `${product.variants.length} ${
                          product.variants.length === 1 ? 'size' : 'sizes'
                        }`}
                    <ChevronDown
                      className={cn('size-4 transition-transform', {
                        'rotate-180': isOpen,
                      })}
                    />
                  </span>
                </ProductRow>

                {isOpen && (
                  <div className="mt-0.5 mb-1.5 ml-6 flex flex-col gap-0.5 border-l pl-3">
                    {product.variants.map((variant) => (
                      <label
                        key={variant.id}
                        className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-xs"
                      >
                        <Checkbox
                          checked={selectedIds.includes(variant.id)}
                          onCheckedChange={() => toggle(variant.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">
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
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}

        <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
      </div>

      <p className="text-muted-foreground text-xs">
        {selectedIds.length} selected.{' '}
        <CatalogCount shown={products.length} total={total} />
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
  initialCursor,
  currencyCode,
  onPick,
  trigger,
  title = 'Choose a product',
  /** When set, the dialog asks for a variant after the product is chosen. */
  pickVariant = false,
}: ProductPickerProps & {
  onPick: (
    productId: string,
    variantId: string | null,
    product: PickerProduct
  ) => void
  trigger: React.ReactNode
  title?: string
  pickVariant?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { query, setQuery, products, pending, hasMore, loadingMore, loadMore } =
    useCatalogSearch(initialProducts, { initialCursor })

  function choose(product: PickerProduct) {
    // A product with one variant has nothing to disambiguate, so asking would
    // be a click that always has the same answer.
    if (pickVariant && product.variants.length > 1) {
      setExpanded((current) => (current === product.id ? null : product.id))
      return
    }

    onPick(
      product.id,
      pickVariant ? (product.variants[0]?.id ?? null) : null,
      product
    )
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
                          onPick(product.id, variant.id, product)
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

          <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
        </div>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  )
}
