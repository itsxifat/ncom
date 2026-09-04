import 'server-only'
import { prisma } from '@/server/db/client'
import { requireHumanOrgAccess } from '@/server/auth/rbac'
import { holdForOrder, returnToStock } from './inventoryService'
import { resolveVariants, type ResolvedVariant } from '@/server/catalog'
import { emitOrderWebhook } from './orderService'
import { loadTaxRates, parseAddress } from './pricingService'
import { quoteOrderEdit, type OrderEditQuoteLine } from './orderEditPricing'
import {
  applyBps,
  clampNonNegative,
  formatMoney,
  taxFromInclusive,
} from '@/lib/money'
import { isOrderCancelled } from '@/lib/order-status'
import type { TaxLine } from '@/lib/pricing'
import type { Prisma } from '@/generated/prisma/client'
import type { OrderWorkflowState } from '@/generated/prisma/enums'

/**
 * Editing a placed order.
 *
 * The customer rings up: "make it three, not two", "add a second one in blue",
 * "drop the socks". In a cash-on-delivery market that call comes before the
 * parcel has left, and refusing to change the order means cancelling it and
 * re-keying the whole thing — losing the order number, the attribution and the
 * customer's place in the day's picking run.
 *
 * This is the one deliberate exception to the append-only rule in
 * orderService's header, and it is bounded so the rule still holds where it
 * matters:
 *
 *   - Nothing already settled can be edited. Once stock has been consumed
 *     (`stockConsumedAt`) the goods are with a courier and the order describes
 *     a physical fact, not an intention. Cancelled orders are closed.
 *   - Nothing already refunded or returned can be edited below what was handed
 *     back, because those rows point at line quantities that must stay real.
 *   - Every edit writes an OrderEvent naming what changed and who changed it,
 *     so the order's history still reconstructs — it is a ledger with
 *     amendments rather than a ledger with no amendments.
 *
 * Prices are re-read from the catalogue for *added* lines only. An existing
 * line keeps the unit price it was sold at even if the product has since gone
 * up: the customer agreed a price, and quietly repricing their order on a phone
 * call is how a merchant loses them.
 *
 * The merchant may still set a price by hand, per line, for this order alone —
 * "I'll do it for eight hundred" is the other half of the same phone call, and
 * before this it could only be done by typing an order-level discount that
 * happened to equal the difference, which reads on the invoice as a discount
 * the customer never asked for. A hand-set price never touches the catalogue,
 * and it is refused on a line that has already been refunded or returned,
 * because those rows point at money that moved against the old price.
 */

/** Why an order cannot be edited, in the merchant's language. */
export class OrderNotEditableError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'OrderNotEditableError'
  }
}

/** One line as the editor wants it to end up. */
export interface OrderEditLine {
  /** Set for a line already on the order. */
  orderLineId?: string | null
  /** Set for a line being added. Ignored when `orderLineId` is present. */
  variantId?: string | null
  /**
   * The product that variant belongs to, on the merchant's own site.
   *
   * Sent by the picker alongside the variant id so the line can be resolved
   * with one products call. Optional for older callers, which fall back to the
   * connector's `/variants` endpoint if it has one.
   */
  productId?: string | null
  quantity: number
  /**
   * Given away rather than sold.
   *
   * "Put a pair of socks in for the trouble" is the most common thing a
   * merchant says on a complaint call, and before this it could only be done by
   * adding the socks and then typing a discount that happened to equal their
   * price — which reads, on the order and in the margin report, as if the socks
   * were sold at a loss.
   */
  isGift?: boolean
  /**
   * What one of these costs on this order, in minor units.
   *
   * Omitted keeps the price the line already carries — an added line falls back
   * to the catalogue. This is the negotiated price and nothing else: it is
   * written to the OrderLine and never back to the product, so the next
   * customer is quoted the catalogue as usual.
   */
  unitPriceCents?: number | null
}

export interface OrderEditInput {
  /**
   * The complete desired set of lines. Lines absent from this list are removed
   * — a whole-basket submission rather than a stream of add/remove commands,
   * because the merchant is looking at the basket while they talk and the two
   * models disagree the moment two people edit at once.
   */
  lines: OrderEditLine[]
  /** Delivery charge in minor units. Omitted leaves it as it was. */
  shippingCents?: number
  /** Waive delivery outright. Distinct from a zero charge in the timeline. */
  waiveShipping?: boolean
  /**
   * The code to judge against the edited basket.
   *
   * `undefined` re-judges whatever the order already carries; a string tries
   * that code instead; `null` takes the code off.
   */
  discountCode?: string | null
  /** Money off by hand, over and above every rule. */
  manualDiscountCents?: number
  manualDiscountReason?: string
  /** Why, for the timeline. */
  reason?: string
}

/**
 * Whether this order can be edited at all, and why not.
 *
 * Exported so the page can render the editor disabled with the real reason on
 * it, rather than offering a button that fails on submit.
 */
export function orderEditability(order: {
  workflowState: OrderWorkflowState
  cancelledAt: Date | null
  workflowUpdatedAt?: Date | null
  stockConsumedAt: Date | null
  closedAt: Date | null
}): { editable: boolean; reason: string | null } {
  // Asked of the merged status, so an order the courier cancelled is as
  // uneditable as one the merchant cancelled — they are the same thing.
  if (isOrderCancelled(order)) {
    return { editable: false, reason: 'This order has been cancelled.' }
  }
  if (order.closedAt) {
    return { editable: false, reason: 'This order is closed.' }
  }
  if (order.stockConsumedAt) {
    return {
      editable: false,
      reason:
        'The goods have already gone out with a courier. Record a return or a refund instead.',
    }
  }
  return { editable: true, reason: null }
}

/**
 * Re-derives a line's tax from the rates it was placed under.
 *
 * The stored `taxLines` are the snapshot taken at checkout, so scaling by the
 * new taxable base keeps an edited order taxed the way it was sold — not the
 * way the tax table reads today. A merchant who changes a VAT rate on Tuesday
 * has not changed what Monday's customer owes.
 */
function retaxLine(
  storedTaxLines: unknown,
  taxableBase: number,
  pricesIncludeTax: boolean,
  /** What the line was taxed before, and on what, for the fallback below. */
  previous: { taxCents: number; base: number }
): { taxLines: TaxLine[]; taxCents: number } {
  // No rate breakdown to work from. An order written before taxLines were
  // recorded — or by an importer that only set the total — still has real tax
  // on it, and returning zero here would quietly wipe it off the invoice the
  // first time someone changed a quantity. Scale what was there instead.
  if (!Array.isArray(storedTaxLines) || storedTaxLines.length === 0) {
    if (previous.taxCents === 0 || previous.base <= 0) {
      return { taxLines: [], taxCents: 0 }
    }
    return {
      taxLines: [],
      taxCents: Math.round((previous.taxCents / previous.base) * taxableBase),
    }
  }

  const taxLines: TaxLine[] = []
  for (const entry of storedTaxLines) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record.rateBps !== 'number') continue

    taxLines.push({
      title: typeof record.title === 'string' ? record.title : 'Tax',
      rateBps: record.rateBps,
      amountCents: pricesIncludeTax
        ? taxFromInclusive(taxableBase, record.rateBps)
        : applyBps(taxableBase, record.rateBps),
    })
  }

  return {
    taxLines,
    taxCents: taxLines.reduce((sum, tax) => sum + tax.amountCents, 0),
  }
}

/**
 * Applies a merchant's edit to a placed order.
 *
 * Everything happens in one transaction: line writes, the inventory movements
 * they imply, the recomputed totals and the timeline entry. A partial edit —
 * stock moved but quantities not saved — is the failure mode that makes an
 * order book stop being trustworthy, so there is no path that produces one.
 */
export async function editOrder(
  organizationId: string,
  orderId: string,
  input: OrderEditInput
) {
  const { session } = await requireHumanOrgAccess(organizationId, 'EDITOR')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: {
      lines: { orderBy: { id: 'asc' } },
    },
  })
  if (!order) throw new Error('Order not found')

  const { editable, reason } = orderEditability(order)
  if (!editable) throw new OrderNotEditableError(reason ?? 'Not editable')

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { pricesIncludeTax: true },
  })
  const pricesIncludeTax = settings?.pricesIncludeTax ?? false

  const existingById = new Map(order.lines.map((line) => [line.id, line]))

  // ── Work out the three buckets before touching anything ────────────────

  const keptIds = new Set<string>()
  const updates: {
    line: (typeof order.lines)[number]
    quantity: number
    isGift: boolean
    unitPriceCents: number
  }[] = []
  const additions: {
    variantId: string
    productId: string | null
    quantity: number
    isGift: boolean
    /** Null falls back to the catalogue price. */
    unitPriceCents: number | null
  }[] = []

  for (const requested of input.lines) {
    const quantity = Math.trunc(requested.quantity)
    const isGift = requested.isGift ?? false
    const requestedPrice = requestedUnitPrice(requested.unitPriceCents)

    if (requested.orderLineId) {
      const line = existingById.get(requested.orderLineId)
      if (!line) throw new Error('That line is not part of this order')
      if (keptIds.has(line.id)) {
        throw new Error(`"${line.title}" appears twice in this edit`)
      }
      if (quantity < 1) {
        throw new Error(
          `Set "${line.title}" to at least 1, or remove it from the order`
        )
      }

      // Refunds and returns point at quantities on this line. Dropping below
      // what has already been handed back would leave those rows describing
      // units the order no longer claims to have sold.
      const settled = Math.max(line.refundedQuantity, line.returnedQuantity)
      if (quantity < settled) {
        throw new Error(
          `"${line.title}" cannot go below ${settled} — that many have already been returned or refunded`
        )
      }

      // A line that has been partly returned or refunded describes money that
      // has already moved against a price. Turning it into a gift now would
      // make a refund of ৳500 point at a line worth nothing.
      if (isGift !== line.isGift && settled > 0) {
        throw new Error(
          `"${line.title}" cannot become a gift — some of it has already been returned or refunded`
        )
      }

      const unitPriceCents = requestedPrice ?? line.unitPriceCents

      // The same reasoning as the gift guard above, for the same rows. A
      // RefundLine's amount was frozen from this line's price, and a return's
      // arithmetic re-derives from it; moving the price under them leaves both
      // describing money at a price the order no longer claims.
      if (unitPriceCents !== line.unitPriceCents && settled > 0) {
        throw new Error(
          `"${line.title}" cannot be repriced — ${settled} have already been returned or refunded`
        )
      }

      keptIds.add(line.id)
      if (
        quantity !== line.quantity ||
        isGift !== line.isGift ||
        unitPriceCents !== line.unitPriceCents
      ) {
        updates.push({ line, quantity, isGift, unitPriceCents })
      }
      continue
    }

    if (!requested.variantId) continue
    if (quantity < 1) continue
    additions.push({
      variantId: requested.variantId,
      productId: requested.productId ?? null,
      quantity,
      isGift,
      unitPriceCents: requestedPrice,
    })
  }

  const removals = order.lines.filter((line) => !keptIds.has(line.id))

  for (const line of removals) {
    const settled = Math.max(line.refundedQuantity, line.returnedQuantity)
    if (settled > 0) {
      throw new Error(
        `"${line.title}" cannot be removed — ${settled} have already been returned or refunded`
      )
    }
  }

  // ── Load what the added lines need, outside the transaction ────────────

  // Read from the merchant's own website, scoped to this workspace's
  // connection — which is what stops a variant id guessed from another
  // workspace being attached to this order: it simply does not resolve here.
  const variantById = additions.length
    ? await resolveVariants(organizationId, additions)
    : new Map<string, ResolvedVariant>()

  for (const addition of additions) {
    if (!variantById.has(addition.variantId)) {
      throw new Error('That product is no longer available')
    }
  }

  // New lines are taxed at today's rates for the order's own destination.
  // There is no snapshot to inherit — this line was not part of the original
  // agreement — so the current table is the only honest answer.
  const destination = parseAddress(order.shippingAddress)
  const taxRates = additions.length
    ? await loadTaxRates(
        organizationId,
        destination?.countryCode ?? null,
        destination?.provinceCode ?? null
      )
    : []

  // ── Re-quote the whole basket before touching anything ─────────────────
  //
  // Quoted from the *intended* lines rather than from the rows after the
  // writes, so the offer, the code and the delivery charge are all settled
  // before a single unit of stock moves. An edit that turns out to be
  // unpriceable therefore fails having changed nothing.

  const updateByLineId = new Map(
    updates.map((update) => [update.line.id, update])
  )

  const quoteLines: OrderEditQuoteLine[] = [
    ...order.lines
      .filter((line) => keptIds.has(line.id))
      .map((line) => {
        const update = updateByLineId.get(line.id)
        return {
          key: line.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: update?.quantity ?? line.quantity,
          unitPriceCents: update?.unitPriceCents ?? line.unitPriceCents,
          isGift: update?.isGift ?? line.isGift,
        }
      }),
    ...additions.map((addition, index) => {
      const { variant, product } = variantById.get(addition.variantId)!
      return {
        key: additionKey(index),
        productId: product.id,
        variantId: variant.id,
        quantity: addition.quantity,
        unitPriceCents: addition.unitPriceCents ?? variant.priceCents,
        isGift: addition.isGift,
      }
    }),
  ]

  if (quoteLines.length === 0) {
    throw new Error('An order needs at least one item. Cancel it instead.')
  }

  const shippingWaived = input.waiveShipping ?? order.shippingWaived
  const quote = await quoteOrderEdit({
    organizationId,
    storeId: order.storeId,
    pageId: order.pageId,
    offerKey: order.offerKey,
    lines: quoteLines,
    discountCode: input.discountCode,
    previousCouponCode: order.discountCode,
    // What the code alone was worth, for the "campaign has been deleted"
    // fallback. Recorded on the order for exactly this: `discountTotalCents`
    // also contains the bundle saving, the gift and anything granted by hand,
    // and carrying that forward as "the code" would multiply the discount every
    // time someone edited the order.
    previousCouponCents: order.couponDiscountCents,
    manualDiscountCents: input.manualDiscountCents ?? order.manualDiscountCents,
    shippingCents:
      input.shippingCents === undefined
        ? order.shippingTotalCents
        : Math.trunc(input.shippingCents),
    shippingWaived,
  })

  // Money in the timeline is formatted in the order's own currency. A summary
  // that interpolated the raw minor units read "delivery 6000 → 8000" on an
  // order whose every other screen says ৳60.00 — a hundredfold error to anyone
  // scanning the history, and the numbers in a timeline are exactly what gets
  // read back to a customer who is disputing a charge.
  const money = (cents: number) => formatMoney(cents, order.currencyCode)

  const summary: string[] = []

  // ── What this edit does to the merchant's stock ────────────────────────
  //
  // Netted per variant across removals, quantity changes and additions, so an
  // edit that swaps a medium for a large is one ask and one give rather than a
  // sequence that could briefly refuse itself. Units the customer already has
  // are not touched: once a parcel is with a courier the order is a record of
  // what shipped, and asking the merchant's site to un-ship it is not a thing
  // this edit is entitled to do.
  const movements = new Map<string, number>()
  if (!order.stockConsumedAt) {
    const move = (variantId: string | null, delta: number) => {
      if (!variantId || delta === 0) return
      movements.set(variantId, (movements.get(variantId) ?? 0) + delta)
    }

    for (const line of removals) move(line.variantId, -line.quantity)
    for (const { line, quantity } of updates) {
      move(line.variantId, quantity - line.quantity)
    }
    for (const addition of additions) {
      move(addition.variantId, addition.quantity)
    }
  }

  const takes = [...movements]
    .filter(([, delta]) => delta > 0)
    .map(([variantId, delta]) => ({ variantId, quantity: delta }))
  const gives = [...movements]
    .filter(([, delta]) => delta < 0)
    .map(([variantId, delta]) => ({ variantId, quantity: -delta }))

  // Asked for before anything is written, so an edit the merchant's stock
  // cannot cover fails having changed nothing. Their site's refusal message is
  // passed through: it knows why, and this does not.
  if (takes.length > 0) await holdForOrder(organizationId, orderId, takes)

  const updated = await prisma.$transaction(async (tx) => {
    // ── Removals ────────────────────────────────────────────────────────
    for (const line of removals) {
      summary.push(`removed ${line.quantity} × ${line.title}`)
      await tx.orderLine.delete({ where: { id: line.id } })
    }

    // ── Quantity and gift changes ───────────────────────────────────────
    for (const { line, quantity, isGift, unitPriceCents } of updates) {
      await writeLineMoney(tx, {
        id: line.id,
        quantity,
        unitPriceCents,
        discountCents: quote.lineDiscounts[line.id] ?? 0,
        storedTaxLines: line.taxLines,
        // Deliberately the *old* price and quantity: this is the base the
        // stored tax was actually levied on, and it is what the fallback in
        // retaxLine scales from. Recomputing it from the new price would
        // rescale the tax twice on any order with no rate breakdown.
        previous: {
          taxCents: line.taxTotalCents,
          base: clampNonNegative(
            line.unitPriceCents * line.quantity - line.totalDiscountCents
          ),
        },
        isGift,
        pricesIncludeTax,
      })

      if (quantity !== line.quantity) {
        summary.push(`${line.title} ${line.quantity} → ${quantity}`)
      }
      if (unitPriceCents !== line.unitPriceCents) {
        summary.push(
          `${line.title} ${money(line.unitPriceCents)} → ${money(
            unitPriceCents
          )} each`
        )
      }
      if (isGift !== line.isGift) {
        summary.push(
          isGift
            ? `${line.title} is now a gift`
            : `${line.title} is no longer a gift`
        )
      }
    }

    // Kept lines nobody touched still need their share of a discount that has
    // just been recomputed — a code that stopped qualifying takes money off a
    // line whose quantity never moved.
    for (const line of order.lines) {
      if (!keptIds.has(line.id)) continue
      if (updateByLineId.has(line.id)) continue

      const discountCents = quote.lineDiscounts[line.id] ?? 0
      if (discountCents === line.totalDiscountCents) continue

      await writeLineMoney(tx, {
        id: line.id,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        discountCents,
        storedTaxLines: line.taxLines,
        previous: {
          taxCents: line.taxTotalCents,
          base: clampNonNegative(
            line.unitPriceCents * line.quantity - line.totalDiscountCents
          ),
        },
        isGift: line.isGift,
        pricesIncludeTax,
      })
    }

    // ── Additions ───────────────────────────────────────────────────────
    for (const [index, addition] of additions.entries()) {
      const { variant, product } = variantById.get(addition.variantId)!

      // Read once. `gross` and the stored `unitPriceCents` used to be two
      // separate reads of the catalogue price; with a price that can be set by
      // hand, missing either taxes the line at one price and bills it at
      // another.
      const unitPriceCents = addition.unitPriceCents ?? variant.priceCents
      const gross = unitPriceCents * addition.quantity
      const discountCents = quote.lineDiscounts[additionKey(index)] ?? 0
      const taxableBase = clampNonNegative(gross - discountCents)

      const applicableRates = variant.isTaxable
        ? taxRates.filter(
            (rate) => rate.taxCode === null || rate.taxCode === variant.taxCode
          )
        : []

      const taxLines: TaxLine[] = applicableRates.map((rate) => ({
        title: rate.name,
        rateBps: rate.rateBps,
        amountCents: pricesIncludeTax
          ? taxFromInclusive(taxableBase, rate.rateBps)
          : applyBps(taxableBase, rate.rateBps),
      }))
      const taxCents = taxLines.reduce((sum, tax) => sum + tax.amountCents, 0)

      await tx.orderLine.create({
        data: {
          orderId,
          productId: product.id,
          variantId: variant.id,
          // Snapshotted exactly as checkout does — see the note on OrderLine in
          // schema.prisma. The order must still read correctly after the
          // product is renamed or deleted from the merchant's own site.
          title: product.title,
          variantTitle: variant.title,
          sku: variant.sku,
          vendor: product.vendor,
          imageUrl: variant.imageUrl ?? product.images[0]?.url ?? null,
          quantity: addition.quantity,
          unitPriceCents,
          totalDiscountCents: discountCents,
          taxTotalCents: taxCents,
          taxLines: taxLines as unknown as Prisma.InputJsonValue,
          totalCents: pricesIncludeTax ? taxableBase : taxableBase + taxCents,
          requiresShipping: variant.requiresShipping,
          weightGrams: variant.weightGrams,
          isGift: addition.isGift,
        },
      })

      const name = `${product.title}${
        variant.title && variant.title !== 'Default Title'
          ? ` (${variant.title})`
          : ''
      }`
      // The price is named only when it is not the catalogue's. On the ordinary
      // add it is noise; on a negotiated one it is the whole point of the line.
      const at =
        unitPriceCents === variant.priceCents
          ? ''
          : ` at ${money(unitPriceCents)} each`
      summary.push(
        addition.isGift
          ? `added ${addition.quantity} × ${name} as a gift`
          : `added ${addition.quantity} × ${name}${at}`
      )
    }

    // ── The order's money, from the quote taken above ───────────────────

    const taxTotalCents = (
      await tx.orderLine.findMany({
        where: { orderId },
        select: { taxTotalCents: true },
      })
    ).reduce((sum, line) => sum + line.taxTotalCents, 0)

    // Tax is added on top only when prices exclude it. With tax-inclusive
    // pricing the line prices are already gross, so the quote's subtotal
    // carries the tax and adding it again charges it twice — the same rule
    // priceCart applies at checkout, which is where the two have to agree.
    const totalCents = clampNonNegative(
      quote.totalCents + (pricesIncludeTax ? 0 : taxTotalCents)
    )

    if (quote.shippingTotalCents !== order.shippingTotalCents) {
      summary.push(
        shippingWaived && quote.shippingTotalCents === 0
          ? 'delivery waived'
          : `delivery ${money(order.shippingTotalCents)} → ${money(
              quote.shippingTotalCents
            )}`
      )
    }
    if (quote.offerNote) summary.push(quote.offerNote)
    if (quote.couponNote) summary.push(quote.couponNote)

    // What the code did, in figures. The timeline used to say nothing at all
    // about a code unless something went wrong with it: applying one, taking
    // one off, and a code whose worth moved because the basket moved all
    // landed as a silent change to the total. "Why is this order ৳500 cheaper
    // than the one I quoted" is asked of this list.
    if (quote.couponCode !== order.discountCode) {
      summary.push(
        quote.couponCode
          ? order.discountCode
            ? `code ${order.discountCode} → ${quote.couponCode}`
            : `code ${quote.couponCode} applied`
          : `code ${order.discountCode} removed`
      )
    }
    if (quote.couponDiscountCents !== order.couponDiscountCents) {
      summary.push(
        `code discount ${money(order.couponDiscountCents)} → ${money(
          quote.couponDiscountCents
        )}`
      )
    }
    if (quote.manualDiscountCents !== order.manualDiscountCents) {
      summary.push(
        `extra discount ${money(order.manualDiscountCents)} → ${money(
          quote.manualDiscountCents
        )}` +
          (input.manualDiscountReason ? ` (${input.manualDiscountReason})` : '')
      )
    }

    // Payment status follows the new total. An order that was PAID and has just
    // grown is no longer paid, and one that shrank below what was collected is
    // over-paid — which the merchant settles with a refund, so it reads as PAID
    // here rather than inventing a state for it.
    const financialStatus = nextFinancialStatus(
      order.financialStatus,
      order.paidTotalCents,
      totalCents
    )

    const saved = await tx.order.update({
      where: { id: orderId },
      data: {
        subtotalCents: quote.subtotalCents,
        discountTotalCents: quote.discountTotalCents,
        shippingTotalCents: quote.shippingTotalCents,
        shippingWaived,
        taxTotalCents,
        totalCents,
        financialStatus,
        discountCode: quote.couponCode,
        couponDiscountCents: quote.couponDiscountCents,
        manualDiscountCents: quote.manualDiscountCents,
        manualDiscountReason:
          input.manualDiscountReason?.trim() ||
          (quote.manualDiscountCents > 0 ? order.manualDiscountReason : null),
      },
    })

    // A save that moved no line can still move money — a code that expired
    // between the order and the call, an offer the merchant has since retired.
    // Saying "totals recalculated" is more use to whoever reads this later than
    // an empty list of changes.
    const what = summary.length > 0 ? summary.join(', ') : 'totals recalculated'

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'order_edited',
        message: input.reason
          ? `Order edited — ${what} (${input.reason})`
          : `Order edited — ${what}`,
        actorUserId: session.user.id,
      },
    })

    return saved
  })

  // Given back only once the edit is safely written. The reverse order would
  // hand units back for a change that then failed to save.
  await returnToStock(organizationId, orderId, gives, { orderId })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return { orderId, changed: true as const, order: updated, quote }
}

/**
 * What this edit would cost, without doing it.
 *
 * The editor calls this as the merchant changes quantities, so "so what's my
 * total now" is answerable while the customer is still on the phone rather than
 * after a save they cannot undo. It runs the identical quote the save runs —
 * the point of the shared module — so the number on screen is the number that
 * lands.
 *
 * Read-only and cheap to be wrong about: it validates ownership and nothing
 * else, because a preview that refuses to price an impossible basket tells the
 * merchant nothing about which part of it is impossible.
 */
export async function previewOrderEdit(
  organizationId: string,
  orderId: string,
  input: OrderEditInput
) {
  await requireHumanOrgAccess(organizationId, 'VIEWER')

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: { lines: { orderBy: { id: 'asc' } } },
  })
  if (!order) throw new Error('Order not found')

  const existingById = new Map(order.lines.map((line) => [line.id, line]))

  const requestedRefs = input.lines
    .filter((line) => !line.orderLineId && line.variantId)
    .map((line) => ({
      variantId: line.variantId!,
      productId: line.productId ?? null,
    }))

  // The same read the save performs, so the preview cannot quote a price the
  // save then declines to honour.
  const variantById = requestedRefs.length
    ? await resolveVariants(organizationId, requestedRefs)
    : new Map<string, ResolvedVariant>()

  const lines: OrderEditQuoteLine[] = []
  for (const [index, requested] of input.lines.entries()) {
    const quantity = Math.trunc(requested.quantity)
    if (quantity < 1) continue

    if (requested.orderLineId) {
      const line = existingById.get(requested.orderLineId)
      if (!line) continue
      lines.push({
        key: line.id,
        productId: line.productId,
        variantId: line.variantId,
        quantity,
        // Resolved exactly as the save resolves it, or the price on screen
        // stops being the price that lands — which is the whole point of
        // sharing one quote between preview and save.
        unitPriceCents:
          requestedUnitPrice(requested.unitPriceCents) ?? line.unitPriceCents,
        isGift: requested.isGift ?? line.isGift,
      })
      continue
    }

    const entry = requested.variantId
      ? variantById.get(requested.variantId)
      : undefined
    if (!entry) continue

    lines.push({
      key: additionKey(index),
      productId: entry.product.id,
      variantId: entry.variant.id,
      quantity,
      unitPriceCents:
        requestedUnitPrice(requested.unitPriceCents) ??
        entry.variant.priceCents,
      isGift: requested.isGift ?? false,
    })
  }

  return quoteOrderEdit({
    organizationId,
    storeId: order.storeId,
    pageId: order.pageId,
    offerKey: order.offerKey,
    lines,
    discountCode: input.discountCode,
    previousCouponCode: order.discountCode,
    previousCouponCents: order.couponDiscountCents,
    manualDiscountCents: input.manualDiscountCents ?? order.manualDiscountCents,
    shippingCents:
      input.shippingCents === undefined
        ? order.shippingTotalCents
        : Math.trunc(input.shippingCents),
    shippingWaived: input.waiveShipping ?? order.shippingWaived,
  })
}

/** Stable key for a line that does not exist yet, shared with the quote. */
function additionKey(index: number): string {
  return `new:${index}`
}

/**
 * A hand-set unit price, or null for "leave it alone".
 *
 * Negative is refused here rather than clamped. A minus sign survives
 * `parseMoneyInput`, and a negative line does not merely price itself wrongly —
 * it drags the subtotal below the sum of the other lines, and every discount
 * that is capped against the subtotal then caps against a number that is not
 * the basket. Refusing is also the honest answer to what was almost certainly
 * a typo.
 */
function requestedUnitPrice(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isFinite(value)) throw new Error('That is not a price')
  const cents = Math.trunc(value)
  if (cents < 0) throw new Error('A price cannot be negative')
  return cents
}

/**
 * Writes one existing line's money, retaxed on its new base.
 *
 * A gift keeps its real unit price and carries an equal discount, so the
 * subtotal still says what the goods were worth and the discount total says
 * what was given away — see the note on OrderLine.isGift in schema.prisma.
 */
async function writeLineMoney(
  tx: Prisma.TransactionClient,
  line: {
    id: string
    quantity: number
    unitPriceCents: number
    discountCents: number
    storedTaxLines: unknown
    previous: { taxCents: number; base: number }
    isGift: boolean
    pricesIncludeTax: boolean
  }
) {
  const gross = line.unitPriceCents * line.quantity
  const discountCents = line.isGift
    ? gross
    : Math.min(clampNonNegative(line.discountCents), gross)
  const taxableBase = clampNonNegative(gross - discountCents)

  const { taxLines, taxCents } = retaxLine(
    line.storedTaxLines,
    taxableBase,
    line.pricesIncludeTax,
    line.previous
  )

  await tx.orderLine.update({
    where: { id: line.id },
    data: {
      quantity: line.quantity,
      // The negotiated price lands here, and only here — the catalogue is
      // untouched, so the next customer is still quoted the list price.
      unitPriceCents: line.unitPriceCents,
      isGift: line.isGift,
      totalDiscountCents: discountCents,
      taxTotalCents: taxCents,
      taxLines: taxLines as unknown as Prisma.InputJsonValue,
      totalCents: line.pricesIncludeTax ? taxableBase : taxableBase + taxCents,
    },
  })
}

/**
 * The payment status an edited order should carry.
 *
 * Only the four "money is still moving" statuses are recomputed. REFUNDED and
 * VOIDED are conclusions someone reached deliberately, and an edit is not a
 * reason to overturn them.
 */
function nextFinancialStatus(
  current: Prisma.OrderGetPayload<object>['financialStatus'],
  paidTotalCents: number,
  totalCents: number
) {
  if (
    current === 'REFUNDED' ||
    current === 'VOIDED' ||
    current === 'PARTIALLY_REFUNDED'
  ) {
    return current
  }
  if (paidTotalCents <= 0) return current === 'AUTHORIZED' ? current : 'PENDING'
  if (paidTotalCents >= totalCents) return 'PAID'
  return 'PARTIALLY_PAID'
}
