import 'server-only'
import { prisma } from '@/server/db/client'
import { requireHumanOrgAccess } from '@/server/auth/rbac'
import {
  commitInventoryForOrder,
  releaseInventoryForOrder,
} from './inventoryService'
import { emitOrderWebhook } from './orderService'
import { loadTaxRates, parseAddress } from './pricingService'
import { quoteOrderEdit, type OrderEditQuoteLine } from './orderEditPricing'
import { applyBps, clampNonNegative, taxFromInclusive } from '@/lib/money'
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
  }[] = []
  const additions: {
    variantId: string
    quantity: number
    isGift: boolean
  }[] = []

  for (const requested of input.lines) {
    const quantity = Math.trunc(requested.quantity)
    const isGift = requested.isGift ?? false

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

      keptIds.add(line.id)
      if (quantity !== line.quantity || isGift !== line.isGift) {
        updates.push({ line, quantity, isGift })
      }
      continue
    }

    if (!requested.variantId) continue
    if (quantity < 1) continue
    additions.push({ variantId: requested.variantId, quantity, isGift })
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

  const addedVariants = additions.length
    ? await prisma.productVariant.findMany({
        where: {
          id: { in: additions.map((addition) => addition.variantId) },
          // Scoped through the product, so a variant id guessed from another
          // workspace cannot be attached to this order.
          product: { organizationId },
        },
        include: {
          product: {
            select: { id: true, title: true, vendor: true },
          },
        },
      })
    : []

  const variantById = new Map(
    addedVariants.map((variant) => [variant.id, variant])
  )

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
          unitPriceCents: line.unitPriceCents,
          isGift: update?.isGift ?? line.isGift,
        }
      }),
    ...additions.map((addition, index) => {
      const variant = variantById.get(addition.variantId)!
      return {
        key: additionKey(index),
        productId: variant.product.id,
        variantId: variant.id,
        quantity: addition.quantity,
        unitPriceCents: variant.priceCents,
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

  const summary: string[] = []

  const updated = await prisma.$transaction(async (tx) => {
    // ── Removals ────────────────────────────────────────────────────────
    for (const line of removals) {
      summary.push(`removed ${line.quantity} × ${line.title}`)

      if (line.variantId) {
        await releaseInventoryForOrder(tx, orderId, [
          {
            variantId: line.variantId,
            quantity: line.quantity,
            inventoryTracked: true,
          },
        ])
      }

      await tx.orderLine.delete({ where: { id: line.id } })
    }

    // ── Quantity and gift changes ───────────────────────────────────────
    for (const { line, quantity, isGift } of updates) {
      const delta = quantity - line.quantity

      if (line.variantId && delta !== 0) {
        if (delta > 0) {
          const variant = await tx.productVariant.findUnique({
            where: { id: line.variantId },
            select: { inventoryTracked: true, inventoryPolicy: true },
          })

          // A variant deleted since the order was placed has no stock to
          // reserve; the line still edits, because the order is the record and
          // the catalogue is not.
          if (variant) {
            const result = await commitInventoryForOrder(tx, orderId, [
              {
                variantId: line.variantId,
                quantity: delta,
                inventoryTracked: variant.inventoryTracked,
                inventoryPolicy: variant.inventoryPolicy,
              },
            ])
            if (!result.ok) {
              throw new Error(
                `Not enough stock to raise "${line.title}" to ${quantity}`
              )
            }
          }
        } else {
          await releaseInventoryForOrder(tx, orderId, [
            {
              variantId: line.variantId,
              quantity: -delta,
              inventoryTracked: true,
            },
          ])
        }
      }

      await writeLineMoney(tx, {
        id: line.id,
        quantity,
        unitPriceCents: line.unitPriceCents,
        discountCents: quote.lineDiscounts[line.id] ?? 0,
        storedTaxLines: line.taxLines,
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
      const variant = variantById.get(addition.variantId)!

      const result = await commitInventoryForOrder(tx, orderId, [
        {
          variantId: variant.id,
          quantity: addition.quantity,
          inventoryTracked: variant.inventoryTracked,
          inventoryPolicy: variant.inventoryPolicy,
        },
      ])
      if (!result.ok) {
        throw new Error(
          `Not enough stock to add ${addition.quantity} × ${variant.product.title}`
        )
      }

      const gross = variant.priceCents * addition.quantity
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
          productId: variant.product.id,
          variantId: variant.id,
          // Snapshotted exactly as checkout does — see the note on OrderLine in
          // schema.prisma. The order must still read correctly after the
          // product is renamed or deleted.
          title: variant.product.title,
          variantTitle: variant.title,
          sku: variant.sku,
          vendor: variant.product.vendor,
          quantity: addition.quantity,
          unitPriceCents: variant.priceCents,
          totalDiscountCents: discountCents,
          taxTotalCents: taxCents,
          taxLines: taxLines as unknown as Prisma.InputJsonValue,
          totalCents: pricesIncludeTax ? taxableBase : taxableBase + taxCents,
          requiresShipping: variant.requiresShipping,
          weightGrams: variant.weightGrams,
          isGift: addition.isGift,
        },
      })

      const name = `${variant.product.title}${
        variant.title && variant.title !== 'Default Title'
          ? ` (${variant.title})`
          : ''
      }`
      summary.push(
        addition.isGift
          ? `added ${addition.quantity} × ${name} as a gift`
          : `added ${addition.quantity} × ${name}`
      )
    }

    // ── The order's money, from the quote taken above ───────────────────

    const taxTotalCents = (
      await tx.orderLine.findMany({
        where: { orderId },
        select: { taxTotalCents: true },
      })
    ).reduce((sum, line) => sum + line.taxTotalCents, 0)

    const totalCents = clampNonNegative(quote.totalCents + taxTotalCents)

    if (quote.shippingTotalCents !== order.shippingTotalCents) {
      summary.push(
        shippingWaived && quote.shippingTotalCents === 0
          ? 'delivery waived'
          : `delivery ${order.shippingTotalCents} → ${quote.shippingTotalCents}`
      )
    }
    if (quote.offerNote) summary.push(quote.offerNote)
    if (quote.couponNote) summary.push(quote.couponNote)
    if (quote.manualDiscountCents !== order.manualDiscountCents) {
      summary.push(
        `extra discount ${order.manualDiscountCents} → ${quote.manualDiscountCents}` +
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

  const requestedVariantIds = input.lines
    .filter((line) => !line.orderLineId && line.variantId)
    .map((line) => line.variantId!)

  const variants = requestedVariantIds.length
    ? await prisma.productVariant.findMany({
        where: {
          id: { in: requestedVariantIds },
          product: { organizationId },
        },
        select: { id: true, priceCents: true, productId: true },
      })
    : []
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))

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
        unitPriceCents: line.unitPriceCents,
        isGift: requested.isGift ?? line.isGift,
      })
      continue
    }

    const variant = requested.variantId
      ? variantById.get(requested.variantId)
      : undefined
    if (!variant) continue

    lines.push({
      key: additionKey(index),
      productId: variant.productId,
      variantId: variant.id,
      quantity,
      unitPriceCents: variant.priceCents,
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
