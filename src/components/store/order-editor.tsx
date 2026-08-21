'use client'

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react'
import {
  editOrderAction,
  searchCatalogAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import type { PickerProduct } from '@/server/services/productService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { MoneyInput } from '@/components/store/form-controls'
import { ProductThumb } from '@/components/media/product-thumb'
import {
  centsToMajorString,
  formatMoney,
  formatMoneyAmount,
  minorUnitsPerMajor,
} from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Editing an order while the customer is on the phone.
 *
 * The shape of this screen follows the shape of that call: the basket is on the
 * left because it is what is being discussed, and the catalogue is on the right
 * because "and add a blue one" is an interruption to it, not a separate task.
 * Both are visible at once on a desktop — a merchant who has to close the
 * basket to search, and close the search to check the basket, cannot answer
 * "so what's my total now" without hanging up.
 *
 * Nothing commits until Save. Every quantity change, removal and addition is
 * local state, the running total is recomputed as they go, and a removed line
 * can be put back — because the person making these edits is repeating numbers
 * back to someone and will get one wrong.
 */

export interface EditableOrderLine {
  id: string
  /** Null when the variant was deleted since the order was placed. */
  variantId: string | null
  title: string
  variantTitle: string | null
  sku: string | null
  imageUrl: string | null
  quantity: number
  unitPriceCents: number
  totalDiscountCents: number
  /** Units already returned or refunded — the floor this line cannot go below. */
  settledQuantity: number
}

/** A line the merchant has added but not yet saved. */
interface DraftLine {
  key: string
  variantId: string
  productTitle: string
  variantTitle: string | null
  sku: string | null
  imageUrl: string | null
  unitPriceCents: number
  quantity: number
  /** Null when the variant does not track stock. */
  available: number | null
}

const SEARCH_DELAY_MS = 250

export function OrderEditor({
  orderId,
  orderNumber,
  currencyCode,
  lines,
  shippingCents,
  discountTotalCents,
  taxTotalCents,
  editable,
  notEditableReason,
}: {
  orderId: string
  orderNumber: string
  currencyCode: string
  lines: EditableOrderLine[]
  shippingCents: number
  discountTotalCents: number
  taxTotalCents: number
  editable: boolean
  notEditableReason: string | null
}) {
  const [open, setOpen] = useState(false)

  if (!editable) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        title={notEditableReason ?? undefined}
      >
        <Pencil />
        Edit order
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Pencil />
        Edit order
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-full max-w-[calc(100%-1rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* Remounted per open so an abandoned edit does not come back next
            time — the merchant reopening this expects the order as it is, not
            the half-finished basket they walked away from. */}
        {open && (
          <EditorBody
            key={String(open)}
            orderId={orderId}
            orderNumber={orderNumber}
            currencyCode={currencyCode}
            lines={lines}
            shippingCents={shippingCents}
            discountTotalCents={discountTotalCents}
            taxTotalCents={taxTotalCents}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditorBody({
  orderId,
  orderNumber,
  currencyCode,
  lines,
  shippingCents,
  discountTotalCents,
  taxTotalCents,
  onDone,
}: {
  orderId: string
  orderNumber: string
  currencyCode: string
  lines: EditableOrderLine[]
  shippingCents: number
  discountTotalCents: number
  taxTotalCents: number
  onDone: () => void
}) {
  // Existing lines, by id. Quantity 0 is not a valid save — it is how a row
  // marks itself removed while staying on screen so it can be undone.
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.quantity]))
  )
  const [drafts, setDrafts] = useState<DraftLine[]>([])
  // Through the currency's real exponent, not a hardcoded 100 — a yen delivery
  // charge divided by a hundred would come back as one-hundredth of itself.
  const [shipping, setShipping] = useState(() =>
    centsToMajorString(shippingCents, currencyCode)
  )

  const boundAction = editOrderAction.bind(null, orderId)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  // Closing on success rather than leaving the dialog up with a green message
  // in it: the page behind has already re-rendered with the new totals, and
  // that is the thing the merchant wants to read back to the customer.
  useEffect(() => {
    if (state?.success) onDone()
  }, [state?.success, onDone])

  const setQuantity = (id: string, next: number) =>
    setQuantities((current) => ({ ...current, [id]: Math.max(0, next) }))

  const addVariant = (product: PickerProduct, variantId: string) => {
    const variant = product.variants.find((entry) => entry.id === variantId)
    if (!variant) return

    // Adding something already in the basket bumps it instead of stacking a
    // second identical row — two lines of the same thing is a picking error
    // waiting to happen. Matched on the variant id rather than the SKU, which
    // is optional in this catalogue: two variants with no SKU are both null,
    // and matching on that would merge the small one into the large one.
    const existing = lines.find(
      (line) => line.variantId === variantId && (quantities[line.id] ?? 0) > 0
    )
    if (existing) {
      setQuantity(existing.id, (quantities[existing.id] ?? 0) + 1)
      return
    }

    setDrafts((current) => {
      const already = current.find((draft) => draft.variantId === variantId)
      if (already) {
        return current.map((draft) =>
          draft.variantId === variantId
            ? { ...draft, quantity: draft.quantity + 1 }
            : draft
        )
      }
      return [
        ...current,
        {
          key: `${variantId}-${Date.now()}`,
          variantId,
          productTitle: product.title,
          variantTitle:
            variant.title && variant.title !== 'Default Title'
              ? variant.title
              : null,
          sku: variant.sku,
          imageUrl: product.imageUrl,
          unitPriceCents: variant.priceCents,
          quantity: 1,
          available: variant.tracksInventory ? variant.available : null,
        },
      ]
    })
  }

  // ── Running totals, recomputed on every keystroke ────────────────────────
  //
  // Tax is carried, not recomputed: the rates live on the server and a number
  // that moved in the browser and then landed differently on save would be
  // worse than one that visibly does not move. The subtotal and the delta are
  // what the merchant is actually reading out.
  const keptSubtotal = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * (quantities[line.id] ?? 0),
    0
  )
  const draftSubtotal = drafts.reduce(
    (sum, draft) => sum + draft.unitPriceCents * draft.quantity,
    0
  )
  const subtotalCents = keptSubtotal + draftSubtotal

  const shippingParsed = Math.max(
    0,
    Math.round(
      (Number.parseFloat(shipping) || 0) * minorUnitsPerMajor(currencyCode)
    )
  )
  const newTotal = Math.max(
    0,
    subtotalCents -
      Math.min(discountTotalCents, subtotalCents) +
      shippingParsed +
      taxTotalCents
  )
  const originalTotal = Math.max(
    0,
    lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0) -
      discountTotalCents +
      shippingCents +
      taxTotalCents
  )
  const delta = newTotal - originalTotal

  const keptCount = lines.filter(
    (line) => (quantities[line.id] ?? 0) > 0
  ).length
  const itemCount =
    lines.reduce((sum, line) => sum + (quantities[line.id] ?? 0), 0) +
    drafts.reduce((sum, draft) => sum + draft.quantity, 0)

  const emptied = keptCount === 0 && drafts.length === 0

  const payload = JSON.stringify([
    ...lines
      .filter((line) => (quantities[line.id] ?? 0) > 0)
      .map((line) => ({
        orderLineId: line.id,
        quantity: quantities[line.id] ?? line.quantity,
      })),
    ...drafts.map((draft) => ({
      variantId: draft.variantId,
      quantity: draft.quantity,
    })),
  ])

  const dirty =
    lines.some((line) => (quantities[line.id] ?? 0) !== line.quantity) ||
    drafts.length > 0 ||
    shippingParsed !== shippingCents

  return (
    <form action={action} className="flex max-h-[92vh] min-h-0 flex-col">
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="shipping" value={shipping} />

      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle className="font-display text-lg font-semibold tracking-tight">
          Edit {orderNumber}
        </DialogTitle>
        <p className="text-muted-foreground text-sm">
          Change quantities, remove items or add products. Stock moves when you
          save.
        </p>
      </DialogHeader>

      {/* A floor on the height, so a one-line order does not collapse the
          catalogue beside it into a three-row window. The panes scroll
          independently above it. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:min-h-[26rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ── The basket ─────────────────────────────────────────────── */}
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              Items{' '}
              <span className="text-muted-foreground font-normal">
                ({itemCount})
              </span>
            </h3>
            {dirty && <Badge variant="secondary">Unsaved</Badge>}
          </div>

          <div className="flex flex-col gap-1.5">
            {lines.map((line) => {
              const quantity = quantities[line.id] ?? 0
              const removed = quantity === 0
              const floor = line.settledQuantity

              return (
                <div
                  key={line.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-2.5 transition-colors',
                    removed
                      ? 'bg-muted/40 border-dashed opacity-60'
                      : 'border-border'
                  )}
                >
                  <ProductThumb
                    src={line.imageUrl}
                    alt={line.title}
                    size="sm"
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm font-medium',
                        removed && 'line-through'
                      )}
                    >
                      {line.title}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {line.variantTitle &&
                        line.variantTitle !== 'Default Title' && (
                          <>{line.variantTitle} · </>
                        )}
                      {formatMoneyAmount(line.unitPriceCents, currencyCode)}{' '}
                      each
                      {floor > 0 && <> · {floor} settled</>}
                    </p>
                  </div>

                  {removed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setQuantity(line.id, line.quantity)}
                    >
                      <Undo2 />
                      Undo
                    </Button>
                  ) : (
                    <>
                      <Stepper
                        value={quantity}
                        min={Math.max(1, floor)}
                        onChange={(next) => setQuantity(line.id, next)}
                        label={line.title}
                      />
                      <p className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                        {formatMoneyAmount(
                          line.unitPriceCents * quantity,
                          currencyCode
                        )}
                      </p>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        // A line with returns or refunds against it points at
                        // quantities that have to stay real, so the server
                        // refuses to drop it. Saying so here beats a failed save.
                        disabled={floor > 0}
                        title={
                          floor > 0
                            ? 'Some of this line has already been returned or refunded'
                            : `Remove ${line.title}`
                        }
                        onClick={() => setQuantity(line.id, 0)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 />
                        <span className="sr-only">Remove {line.title}</span>
                      </Button>
                    </>
                  )}
                </div>
              )
            })}

            {drafts.map((draft) => (
              <div
                key={draft.key}
                className="border-lime/50 bg-lime/5 flex items-center gap-3 rounded-lg border p-2.5"
              >
                <ProductThumb
                  src={draft.imageUrl}
                  alt={draft.productTitle}
                  size="sm"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {draft.productTitle}
                    </p>
                    <Badge variant="lime">New</Badge>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {draft.variantTitle && <>{draft.variantTitle} · </>}
                    {formatMoneyAmount(draft.unitPriceCents, currencyCode)} each
                    {draft.available !== null && (
                      <> · {draft.available} in stock</>
                    )}
                  </p>
                </div>

                <Stepper
                  value={draft.quantity}
                  min={1}
                  onChange={(next) =>
                    setDrafts((current) =>
                      current.map((entry) =>
                        entry.key === draft.key
                          ? { ...entry, quantity: next }
                          : entry
                      )
                    )
                  }
                  label={draft.productTitle}
                />
                <p className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatMoneyAmount(
                    draft.unitPriceCents * draft.quantity,
                    currencyCode
                  )}
                </p>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    setDrafts((current) =>
                      current.filter((entry) => entry.key !== draft.key)
                    )
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                  <span className="sr-only">Remove {draft.productTitle}</span>
                </Button>
              </div>
            ))}
          </div>

          {emptied && (
            <p className="text-destructive mt-3 flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 shrink-0" />
              An order needs at least one item. Cancel the order instead.
            </p>
          )}

          {/* Delivery sits with the basket rather than in a settings panel
              because "I'll waive the delivery for the trouble" is part of the
              same conversation as "make it three". */}
          <div className="mt-5 flex items-center justify-between gap-4 border-t pt-4">
            <div>
              <label htmlFor="edit-shipping" className="text-sm font-medium">
                Delivery charge
              </label>
              <p className="text-muted-foreground text-xs">
                Was {formatMoney(shippingCents, currencyCode)}
              </p>
            </div>
            <MoneyInput
              id="edit-shipping"
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
              currencyCode={currencyCode}
              className="w-32"
            />
          </div>
        </div>

        {/* ── The catalogue ──────────────────────────────────────────── */}
        <div className="bg-muted/30 flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <CatalogPane currencyCode={currencyCode} onAdd={addVariant} />
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-3 rounded-none border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">New total</span>
            <span className="font-display text-lg font-semibold tabular-nums">
              {formatMoney(newTotal, currencyCode)}
            </span>
            {delta !== 0 && (
              <Badge variant={delta > 0 ? 'lime' : 'secondary'}>
                {delta > 0 ? '+' : '−'}
                {formatMoneyAmount(Math.abs(delta), currencyCode)}
              </Badge>
            )}
          </div>
          {state?.error && (
            <p className="text-destructive text-xs">{state.error}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || emptied || !dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            Save changes
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

/**
 * Quantity, as a stepper rather than a number input.
 *
 * The overwhelmingly common edit is ±1, and on the phone in one hand that is a
 * tap rather than select-all-and-retype. The field is still typeable for the
 * merchant who is told "make it twenty".
 */
function Stepper({
  value,
  min,
  onChange,
  label,
}: {
  value: number
  min: number
  onChange: (next: number) => void
  label: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`One fewer ${label}`}
      >
        <Minus />
      </Button>
      <Input
        value={value}
        inputMode="numeric"
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10)
          onChange(Number.isNaN(next) ? min : Math.max(min, next))
        }}
        aria-label={`Quantity of ${label}`}
        className="h-8 w-12 px-1 text-center tabular-nums"
      />
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        onClick={() => onChange(value + 1)}
        aria-label={`One more ${label}`}
      >
        <Plus />
      </Button>
    </div>
  )
}

/**
 * The searchable catalogue, sitting beside the basket.
 *
 * Search is server-side for the same reason the product picker's is: a browser
 * filter over one preloaded page silently fails to find things that exist, and
 * the merchant concludes the product is not in the system.
 *
 * A product with one variant adds on click. A product with several expands to
 * its variants instead, because "add the shirt" is not an instruction a system
 * can carry out when there are four sizes of it.
 */
function CatalogPane({
  currencyCode,
  onAdd,
}: {
  currencyCode: string
  onAdd: (product: PickerProduct, variantId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<PickerProduct[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pending, startTransition] = useTransition()

  // Guards against a slower earlier response landing on top of a later one —
  // the classic way a search box ends up showing results for a prefix.
  const latest = useRef(0)

  useEffect(() => {
    const token = ++latest.current
    const trimmed = query.trim()

    const timer = window.setTimeout(
      () => {
        startTransition(async () => {
          const result = await searchCatalogAction(trimmed)
          if (token !== latest.current) return
          setProducts(result.products)
          setLoaded(true)
        })
      },
      // The first load has nothing to debounce against — waiting a quarter
      // second to show a list nobody typed into just looks slow.
      loaded ? SEARCH_DELAY_MS : 0
    )

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `loaded` only tunes the delay; re-running on it would refetch after the first result
  }, [query])

  return (
    <>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products to add"
            aria-label="Search products to add"
            className="pl-9"
          />
          {pending && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!loaded ? (
          <p className="text-muted-foreground p-3 text-sm">
            Loading catalogue…
          </p>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            {query.trim()
              ? 'Nothing matches that search.'
              : 'No products in the catalogue yet.'}
          </p>
        ) : (
          products.map((product) => {
            const single = product.variants.length === 1
            const isOpen = expanded === product.id
            const outOfStock = product.tracksInventory && product.available <= 0

            return (
              <div key={product.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() =>
                    single
                      ? onAdd(product, product.variants[0]!.id)
                      : setExpanded(isOpen ? null : product.id)
                  }
                  className="hover:bg-background flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors"
                >
                  <div className="bg-muted size-9 shrink-0 overflow-hidden rounded-md">
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
                    <p className="truncate text-sm font-medium">
                      {product.title}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {product.minPriceCents === product.maxPriceCents
                        ? formatMoneyAmount(product.minPriceCents, currencyCode)
                        : `${formatMoneyAmount(product.minPriceCents, currencyCode)} – ${formatMoneyAmount(product.maxPriceCents, currencyCode)}`}
                      {!single && <> · {product.variants.length} options</>}
                      {product.tracksInventory && (
                        <> · {product.available} in stock</>
                      )}
                    </p>
                  </div>

                  {outOfStock ? (
                    <Badge variant="destructive">Out</Badge>
                  ) : single ? (
                    <span className="text-muted-foreground shrink-0">
                      <Plus className="size-4" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {isOpen ? 'Hide' : 'Pick'}
                    </span>
                  )}
                </button>

                {isOpen && !single && (
                  <div className="mt-0.5 mb-1.5 ml-6 flex flex-col gap-0.5 border-l pl-2">
                    {product.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => onAdd(product, variant.id)}
                        className="hover:bg-background flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {variant.title}
                          {variant.sku && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {variant.sku}
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {formatMoneyAmount(variant.priceCents, currencyCode)}
                        </span>
                        {variant.tracksInventory && variant.available <= 0 && (
                          <Badge variant="destructive">Out</Badge>
                        )}
                        <Plus className="text-muted-foreground size-3.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
