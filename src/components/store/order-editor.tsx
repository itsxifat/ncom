'use client'

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  AlertTriangle,
  Check,
  Gift,
  Info,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react'
import {
  editOrderAction,
  previewOrderEditAction,
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
 * Nothing commits until Save. Every quantity change, price, removal and
 * addition is local state, and a removed line can be put back — because the
 * person making these edits is repeating numbers back to someone and will get
 * one wrong.
 *
 * A price typed on a row is that row's price on this order and nowhere else.
 * "I'll do it for eight hundred" is the other half of the call that changes a
 * quantity, and the alternative — an order-level discount that happens to equal
 * the difference — puts a discount on the customer's invoice that they never
 * asked for and that the margin report then has to guess at.
 *
 * The totals are quoted by the server rather than added up here, and that is
 * the important part. Whether the bundle still prices this basket, and whether
 * the code the customer used still qualifies for it, are questions only the
 * rules can answer — so the same quote the save will use is fetched as the
 * merchant types, and the reason a discount fell away is on screen while they
 * can still do something about it.
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
  /** Given away rather than sold. Shows "Gift" where a price would be. */
  isGift: boolean
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
  /** The catalogue price, kept so "was …" can say what it started at. */
  unitPriceCents: number
  /** What the merchant has typed, in major units. Empty means the catalogue. */
  unitPrice: string
  quantity: number
  isGift: boolean
  /** Null when the variant does not track stock. */
  available: number | null
}

const SEARCH_DELAY_MS = 250

/**
 * How long to sit on a change before asking the server what it costs.
 *
 * Long enough that holding the "+" button is one round trip rather than eight,
 * short enough that the number has settled before the merchant finishes saying
 * the sentence they are in the middle of.
 */
const QUOTE_DELAY_MS = 350

export function OrderEditor({
  orderId,
  orderNumber,
  currencyCode,
  lines,
  shippingCents,
  shippingWaived,
  discountCode,
  manualDiscountCents,
  taxTotalCents,
  totalCents,
  editable,
  notEditableReason,
}: {
  orderId: string
  orderNumber: string
  currencyCode: string
  lines: EditableOrderLine[]
  shippingCents: number
  shippingWaived: boolean
  /** The code the customer used, re-judged against whatever they end up with. */
  discountCode: string | null
  manualDiscountCents: number
  taxTotalCents: number
  totalCents: number
  editable: boolean
  notEditableReason: string | null
}) {
  const [open, setOpen] = useState(false)
  // Where the dialog puts focus when it opens.
  //
  // Base UI's default is the first tabbable element, which is now the first
  // row's price field — so opening the editor and starting to type would
  // overwrite a price the merchant had not even looked at yet. Focus goes to
  // the panel instead: the dialog is still announced and Tab still walks it,
  // and nothing is armed to be overwritten by the first keystroke.
  const panelRef = useRef<HTMLFormElement>(null)

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
      <DialogContent
        initialFocus={panelRef}
        className="max-h-[92vh] w-full max-w-[calc(100%-1rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        {/* Remounted per open so an abandoned edit does not come back next
            time — the merchant reopening this expects the order as it is, not
            the half-finished basket they walked away from. */}
        {open && (
          <EditorBody
            key={String(open)}
            panelRef={panelRef}
            orderId={orderId}
            orderNumber={orderNumber}
            currencyCode={currencyCode}
            lines={lines}
            shippingCents={shippingCents}
            shippingWaived={shippingWaived}
            discountCode={discountCode}
            manualDiscountCents={manualDiscountCents}
            taxTotalCents={taxTotalCents}
            totalCents={totalCents}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditorBody({
  panelRef,
  orderId,
  orderNumber,
  currencyCode,
  lines,
  shippingCents,
  shippingWaived,
  discountCode,
  manualDiscountCents,
  taxTotalCents,
  totalCents,
  onDone,
}: {
  /** Where the dialog puts focus on open — see OrderEditor. */
  panelRef: React.RefObject<HTMLFormElement | null>
  orderId: string
  orderNumber: string
  currencyCode: string
  lines: EditableOrderLine[]
  shippingCents: number
  shippingWaived: boolean
  discountCode: string | null
  manualDiscountCents: number
  taxTotalCents: number
  totalCents: number
  onDone: () => void
}) {
  // Existing lines, by id. Quantity 0 is not a valid save — it is how a row
  // marks itself removed while staying on screen so it can be undone.
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.quantity]))
  )
  const [gifts, setGifts] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.isGift]))
  )
  // What each line costs on this order, as typed. Seeded from what the line
  // already carries so the field reads as the current price rather than as an
  // empty box the merchant has to fill in to change one number.
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        centsToMajorString(line.unitPriceCents, currencyCode),
      ])
    )
  )
  const [drafts, setDrafts] = useState<DraftLine[]>([])
  // Through the currency's real exponent, not a hardcoded 100 — a yen delivery
  // charge divided by a hundred would come back as one-hundredth of itself.
  const [shipping, setShipping] = useState(() =>
    centsToMajorString(shippingCents, currencyCode)
  )
  const [waived, setWaived] = useState(shippingWaived)
  const [code, setCode] = useState(discountCode ?? '')
  const [extra, setExtra] = useState(() =>
    centsToMajorString(manualDiscountCents, currencyCode)
  )
  const [extraReason, setExtraReason] = useState('')
  const [reason, setReason] = useState('')

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

  const setGift = (id: string, next: boolean) =>
    setGifts((current) => ({ ...current, [id]: next }))

  const setPrice = (id: string, next: string) =>
    setPrices((current) => ({ ...current, [id]: next }))

  /**
   * A typed price in minor units, or the price it started at.
   *
   * A half-typed or cleared field falls back rather than reading as zero: the
   * merchant deleting "500" to type "450" passes through an empty box, and a
   * running total that dives to the delivery charge and back on every edit is
   * unreadable while someone is talking.
   */
  const priceOf = (typed: string | undefined, fallbackCents: number) => {
    if (typed === undefined || typed.trim() === '') return fallbackCents
    // Cleaned the same way the server cleans it, so "1,200" reads as twelve
    // hundred on both sides and the running total cannot disagree with what
    // the save is about to do.
    const cleaned = typed.replace(/[\s,]/g, '')
    const parsed = Number(cleaned)
    if (cleaned === '' || !Number.isFinite(parsed) || parsed < 0) {
      return fallbackCents
    }
    return Math.round(parsed * minorUnitsPerMajor(currencyCode))
  }

  const addVariant = (
    product: PickerProduct,
    variantId: string,
    asGift = false
  ) => {
    const variant = product.variants.find((entry) => entry.id === variantId)
    if (!variant) return

    // Adding something already in the basket bumps it instead of stacking a
    // second identical row — two lines of the same thing is a picking error
    // waiting to happen. Matched on the variant id rather than the SKU, which
    // is optional in this catalogue: two variants with no SKU are both null,
    // and matching on that would merge the small one into the large one.
    // A gift is a different line from the same thing sold, so it never merges
    // into one — "two shirts, one of them free" is two rows on the packing slip
    // and one of them says Gift.
    const existing = asGift
      ? undefined
      : lines.find(
          (line) =>
            line.variantId === variantId &&
            (quantities[line.id] ?? 0) > 0 &&
            !(gifts[line.id] ?? false)
        )
    if (existing) {
      setQuantity(existing.id, (quantities[existing.id] ?? 0) + 1)
      return
    }

    setDrafts((current) => {
      const already = current.find(
        (draft) => draft.variantId === variantId && draft.isGift === asGift
      )
      if (already) {
        return current.map((draft) =>
          draft === already ? { ...draft, quantity: draft.quantity + 1 } : draft
        )
      }
      return [
        ...current,
        {
          key: `${variantId}-${asGift ? 'gift' : 'sold'}-${Date.now()}`,
          variantId,
          productTitle: product.title,
          variantTitle:
            variant.title && variant.title !== 'Default Title'
              ? variant.title
              : null,
          sku: variant.sku,
          imageUrl: product.imageUrl,
          unitPriceCents: variant.priceCents,
          unitPrice: centsToMajorString(variant.priceCents, currencyCode),
          quantity: 1,
          isGift: asGift,
          available: variant.tracksInventory ? variant.available : null,
        },
      ]
    })
  }

  const keptCount = lines.filter(
    (line) => (quantities[line.id] ?? 0) > 0
  ).length
  const itemCount =
    lines.reduce((sum, line) => sum + (quantities[line.id] ?? 0), 0) +
    drafts.reduce((sum, draft) => sum + draft.quantity, 0)

  const emptied = keptCount === 0 && drafts.length === 0

  const shippingParsed = Math.max(
    0,
    Math.round(
      (Number.parseFloat(shipping) || 0) * minorUnitsPerMajor(currencyCode)
    )
  )

  // The exact payload the save will post. Previewing anything else would let
  // the number on screen and the number that lands drift apart.
  const payload = useMemo(
    () => ({
      lines: [
        ...lines
          .filter((line) => (quantities[line.id] ?? 0) > 0)
          .map((line) => ({
            orderLineId: line.id,
            quantity: quantities[line.id] ?? line.quantity,
            isGift: gifts[line.id] ?? line.isGift,
            unitPrice: prices[line.id] ?? '',
          })),
        ...drafts.map((draft) => ({
          variantId: draft.variantId,
          quantity: draft.quantity,
          isGift: draft.isGift,
          unitPrice: draft.unitPrice,
        })),
      ],
      shipping,
      waiveShipping: waived,
      discountCode: code.trim() || null,
      extraDiscount: extra,
      extraDiscountReason: extraReason,
      reason,
    }),
    [
      lines,
      quantities,
      gifts,
      prices,
      drafts,
      shipping,
      waived,
      code,
      extra,
      extraReason,
      reason,
    ]
  )

  const { quote, quoting } = useEditQuote(orderId, payload, emptied)

  // What is on screen until the first quote lands, and whenever one cannot be
  // taken. Deliberately the *old* totals rather than a browser-side guess: a
  // number that moves and then moves again on save is worse than one that
  // visibly has not caught up yet.
  const subtotalCents =
    quote?.subtotalCents ??
    lines.reduce(
      (sum, line) =>
        sum +
        priceOf(prices[line.id], line.unitPriceCents) *
          (quantities[line.id] ?? 0),
      0
    ) +
      drafts.reduce(
        (sum, draft) =>
          sum + priceOf(draft.unitPrice, draft.unitPriceCents) * draft.quantity,
        0
      )

  const newTotal = quote ? quote.totalCents + taxTotalCents : totalCents
  const delta = newTotal - totalCents

  const extraParsed = Math.max(
    0,
    Math.round(
      (Number.parseFloat(extra) || 0) * minorUnitsPerMajor(currencyCode)
    )
  )

  const dirty =
    lines.some(
      (line) =>
        (quantities[line.id] ?? 0) !== line.quantity ||
        (gifts[line.id] ?? line.isGift) !== line.isGift ||
        priceOf(prices[line.id], line.unitPriceCents) !== line.unitPriceCents
    ) ||
    drafts.length > 0 ||
    shippingParsed !== shippingCents ||
    waived !== shippingWaived ||
    (code.trim() || null) !== discountCode ||
    // Read from the field, not from the quote. Taking it from the quote meant
    // typing an extra discount left Save disabled until a preview happened to
    // land — and disabled again the moment one failed.
    extraParsed !== manualDiscountCents

  return (
    <form
      ref={panelRef}
      tabIndex={-1}
      action={action}
      className="flex max-h-[92vh] min-h-0 flex-col outline-none"
    >
      <input type="hidden" name="edit" value={JSON.stringify(payload)} />

      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle className="font-display text-lg font-semibold tracking-tight">
          Edit {orderNumber}
        </DialogTitle>
        <p className="text-muted-foreground text-sm">
          Change quantities and prices, remove items or add products. A price
          typed here applies to this order only — the catalogue is untouched.
          Stock moves when you save.
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
              const gift = gifts[line.id] ?? line.isGift

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
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          removed && 'line-through'
                        )}
                      >
                        {line.title}
                      </p>
                      {gift && !removed && (
                        <Badge variant="lime">
                          <Gift className="size-3" />
                          Gift
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                      {line.variantTitle &&
                        line.variantTitle !== 'Default Title' && (
                          <span className="truncate">
                            {line.variantTitle} ·
                          </span>
                        )}
                      {removed ? (
                        <span>
                          {formatMoneyAmount(line.unitPriceCents, currencyCode)}{' '}
                          each
                        </span>
                      ) : (
                        <PriceField
                          value={prices[line.id] ?? ''}
                          originalCents={line.unitPriceCents}
                          typedCents={priceOf(
                            prices[line.id],
                            line.unitPriceCents
                          )}
                          currencyCode={currencyCode}
                          // Money has already moved against this line's price,
                          // so the server refuses to change it — see the gift
                          // toggle beside it, which is refused for the same
                          // reason.
                          disabled={floor > 0}
                          label={line.title}
                          onChange={(next) => setPrice(line.id, next)}
                        />
                      )}
                      {floor > 0 && <span>· {floor} settled</span>}
                    </div>
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
                      <LinePrice
                        gift={gift}
                        amountCents={
                          priceOf(prices[line.id], line.unitPriceCents) *
                          quantity
                        }
                        currencyCode={currencyCode}
                      />
                      <GiftToggle
                        gift={gift}
                        // A line with returns or refunds against it points at
                        // money that has already moved against a price, so the
                        // server refuses to turn it into a gift.
                        disabled={floor > 0}
                        label={line.title}
                        onToggle={() => setGift(line.id, !gift)}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
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
                    <Badge variant="lime">
                      {draft.isGift ? (
                        <>
                          <Gift className="size-3" />
                          Gift
                        </>
                      ) : (
                        'New'
                      )}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                    {draft.variantTitle && (
                      <span className="truncate">{draft.variantTitle} ·</span>
                    )}
                    <PriceField
                      value={draft.unitPrice}
                      originalCents={draft.unitPriceCents}
                      typedCents={priceOf(
                        draft.unitPrice,
                        draft.unitPriceCents
                      )}
                      currencyCode={currencyCode}
                      disabled={false}
                      label={draft.productTitle}
                      onChange={(next) =>
                        setDrafts((current) =>
                          current.map((entry) =>
                            entry.key === draft.key
                              ? { ...entry, unitPrice: next }
                              : entry
                          )
                        )
                      }
                    />
                    {draft.available !== null && (
                      <span>· {draft.available} in stock</span>
                    )}
                  </div>
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
                <LinePrice
                  gift={draft.isGift}
                  amountCents={
                    priceOf(draft.unitPrice, draft.unitPriceCents) *
                    draft.quantity
                  }
                  currencyCode={currencyCode}
                />
                <GiftToggle
                  gift={draft.isGift}
                  disabled={false}
                  label={draft.productTitle}
                  onToggle={() =>
                    setDrafts((current) =>
                      current.map((entry) =>
                        entry.key === draft.key
                          ? { ...entry, isGift: !entry.isGift }
                          : entry
                      )
                    )
                  }
                />
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

          {/* Delivery and discounts sit with the basket rather than in a
              settings panel, because "I'll waive the delivery for the trouble"
              and "take another hundred off" are part of the same conversation
              as "make it three". */}
          <div className="mt-5 flex flex-col gap-4 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor="edit-shipping" className="text-sm font-medium">
                  Delivery charge
                </label>
                <p className="text-muted-foreground text-xs">
                  Was {formatMoney(shippingCents, currencyCode)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={waived ? 'default' : 'outline'}
                  onClick={() => setWaived(!waived)}
                  aria-pressed={waived}
                >
                  {waived ? 'Waived' : 'Waive'}
                </Button>
                <MoneyInput
                  id="edit-shipping"
                  value={shipping}
                  onChange={(event) => setShipping(event.target.value)}
                  currencyCode={currencyCode}
                  // A waived charge is not an amount to be typed. Leaving the
                  // field live beside a "Waived" button invites someone to set
                  // a number that is then ignored.
                  disabled={waived}
                  className="w-32"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor="edit-code" className="text-sm font-medium">
                  Discount code
                </label>
                <p className="text-muted-foreground text-xs">
                  Re-checked against the basket as it now stands.
                </p>
              </div>
              <Input
                id="edit-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="None"
                autoCapitalize="characters"
                spellCheck={false}
                className="w-40 shrink-0 font-mono"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor="edit-extra" className="text-sm font-medium">
                  Extra discount
                </label>
                <p className="text-muted-foreground text-xs">
                  Goodwill, on top of every rule.
                </p>
              </div>
              <MoneyInput
                id="edit-extra"
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                currencyCode={currencyCode}
                className="w-32 shrink-0"
              />
            </div>

            {extra.trim() !== '' &&
              extra.trim() !== centsToMajorString(0, currencyCode) && (
                <Input
                  value={extraReason}
                  onChange={(event) => setExtraReason(event.target.value)}
                  placeholder="Why — goes on the order's timeline"
                  className="text-sm"
                />
              )}

            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Note for the timeline — optional"
              className="text-sm"
            />
          </div>
        </div>

        {/* ── The catalogue ──────────────────────────────────────────── */}
        <div className="bg-muted/30 flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <CatalogPane currencyCode={currencyCode} onAdd={addVariant} />
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-3 rounded-none border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {/* What the rules did to this basket, itemised. A merchant reading a
              total back to a customer has to be able to answer "why is it
              that", and the discounts are exactly where that question lands. */}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <span>
              Subtotal {formatMoneyAmount(subtotalCents, currencyCode)}
            </span>
            {quote && quote.offerDiscountCents > 0 && (
              <span>
                {quote.offerLabel ?? 'Offer'} −
                {formatMoneyAmount(quote.offerDiscountCents, currencyCode)}
              </span>
            )}
            {quote && quote.giftDiscountCents > 0 && (
              <span className="flex items-center gap-1">
                <Gift className="size-3" />−
                {formatMoneyAmount(quote.giftDiscountCents, currencyCode)}
              </span>
            )}
            {quote && quote.couponDiscountCents > 0 && (
              <span className="flex items-center gap-1">
                <Tag className="size-3" />
                {quote.couponCode} −
                {formatMoneyAmount(quote.couponDiscountCents, currencyCode)}
              </span>
            )}
            {quote && quote.manualDiscountCents > 0 && (
              <span>
                Extra −
                {formatMoneyAmount(quote.manualDiscountCents, currencyCode)}
              </span>
            )}
            <span>
              Delivery{' '}
              {quote
                ? quote.shippingTotalCents === 0
                  ? 'free'
                  : formatMoneyAmount(quote.shippingTotalCents, currencyCode)
                : formatMoneyAmount(shippingCents, currencyCode)}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">New total</span>
            <span className="font-display text-lg font-semibold tabular-nums">
              {formatMoney(newTotal, currencyCode)}
            </span>
            {quoting && (
              <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
            )}
            {!quoting && delta !== 0 && (
              <Badge variant={delta > 0 ? 'lime' : 'secondary'}>
                {delta > 0 ? '+' : '−'}
                {formatMoneyAmount(Math.abs(delta), currencyCode)}
              </Badge>
            )}
          </div>

          {/* The reason a discount fell away, while the merchant can still act
              on it — put the item back, or grant the difference by hand. */}
          {quote?.offerNote && (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <Info className="mt-0.5 size-3 shrink-0" />
              {quote.offerNote}
            </p>
          )}
          {quote?.couponNote && (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <Info className="mt-0.5 size-3 shrink-0" />
              {quote.couponNote}
            </p>
          )}

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
 * A line's money, or the word Gift where it would be.
 *
 * The price is not struck through and replaced by zero: a gift is not a line
 * sold at nothing, it is a line not sold, and the packer reading this needs to
 * know to put it in the box without asking why it costs nothing.
 */
function LinePrice({
  gift,
  amountCents,
  currencyCode,
}: {
  gift: boolean
  amountCents: number
  currencyCode: string
}) {
  if (gift) {
    return (
      <p className="text-lime-foreground w-20 shrink-0 text-right text-sm font-semibold">
        Gift
      </p>
    )
  }

  return (
    <p className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
      {formatMoneyAmount(amountCents, currencyCode)}
    </p>
  )
}

/**
 * A line's unit price, typed for this order only.
 *
 * Inline where the price already was, rather than behind a "change price"
 * button: the merchant is on a call agreeing a number, and a price that has to
 * be revealed before it can be changed reads as a price that cannot be. It sits
 * in the subtitle line so the row's shape — quantity, line total, gift, remove
 * — does not move.
 *
 * The catalogue is never touched. A changed field says what the price started
 * at, because "what was it before?" is the next question on that call, and once
 * the field is overwritten the row is the only place the old number was.
 */
function PriceField({
  value,
  originalCents,
  typedCents,
  currencyCode,
  disabled,
  label,
  onChange,
}: {
  value: string
  originalCents: number
  /** What `value` resolves to, so "changed" agrees with the running total. */
  typedCents: number
  currencyCode: string
  disabled: boolean
  label: string
  onChange: (next: string) => void
}) {
  const changed = typedCents !== originalCents

  return (
    <span className="flex items-center gap-1.5">
      <Input
        value={value}
        inputMode="decimal"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Price of ${label}, per item`}
        title={
          disabled
            ? 'Some of this line has already been returned or refunded'
            : `Price of ${label} on this order only`
        }
        className={cn(
          'h-7 w-20 px-2 text-xs tabular-nums',
          changed && 'border-lime text-foreground font-medium'
        )}
      />
      <span>each</span>
      {changed && (
        <span className="whitespace-nowrap">
          · was {formatMoneyAmount(originalCents, currencyCode)}
        </span>
      )}
    </span>
  )
}

function GiftToggle({
  gift,
  disabled,
  label,
  onToggle,
}: {
  gift: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      disabled={disabled}
      aria-pressed={gift}
      onClick={onToggle}
      title={
        disabled
          ? 'Some of this line has already been returned or refunded'
          : gift
            ? `Charge for ${label}`
            : `Send ${label} as a gift`
      }
      className={cn(
        'text-muted-foreground',
        gift && 'text-lime-foreground bg-lime/15'
      )}
    >
      <Gift />
      <span className="sr-only">
        {gift ? `Charge for ${label}` : `Send ${label} as a gift`}
      </span>
    </Button>
  )
}

type EditQuote = Extract<
  Awaited<ReturnType<typeof previewOrderEditAction>>,
  { ok: true }
>['quote']

/**
 * Asks the server what the edit on screen costs, as the merchant makes it.
 *
 * Debounced, and guarded against a slower earlier answer landing on top of a
 * later one — the classic way a running total ends up showing the price of a
 * basket the merchant has already changed.
 *
 * A failed quote leaves the previous one on screen rather than blanking the
 * total. The merchant is mid-sentence; a momentarily stale number is far less
 * disruptive than an empty one, and the save re-quotes from scratch anyway.
 */
function useEditQuote(orderId: string, payload: unknown, skip: boolean) {
  const [quote, setQuote] = useState<EditQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const latest = useRef(0)
  const serialized = JSON.stringify(payload)

  useEffect(() => {
    if (skip) return
    const token = ++latest.current

    // The spinner is raised inside the timer rather than beside it: raising it
    // in the effect body sets state during render and, at one keystroke per
    // 40ms, spends more renders on the spinner than on the number.
    const timer = window.setTimeout(() => {
      if (token !== latest.current) return
      setQuoting(true)

      previewOrderEditAction(orderId, JSON.parse(serialized))
        .then((result) => {
          if (token !== latest.current) return
          if (result.ok) setQuote(result.quote)
          setQuoting(false)
        })
        .catch(() => {
          if (token === latest.current) setQuoting(false)
        })
    }, QUOTE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [orderId, serialized, skip])

  return { quote, quoting }
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
