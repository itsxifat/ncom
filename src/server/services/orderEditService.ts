import 'server-only'
import { prisma } from '@/server/db/client'
import { requireHumanOrgAccess } from '@/server/auth/rbac'
import {
  commitInventoryForOrder,
  releaseInventoryForOrder,
} from './inventoryService'
import { emitOrderWebhook } from './orderService'
import { loadTaxRates, parseAddress } from './pricingService'
import { applyBps, clampNonNegative, taxFromInclusive } from '@/lib/money'
import type { TaxLine } from '@/lib/pricing'
import type { Prisma } from '@/generated/prisma/client'

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
  cancelledAt: Date | null
  stockConsumedAt: Date | null
  closedAt: Date | null
}): { editable: boolean; reason: string | null } {
  if (order.cancelledAt) {
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
  }[] = []
  const additions: { variantId: string; quantity: number }[] = []

  for (const requested of input.lines) {
    const quantity = Math.trunc(requested.quantity)

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

      keptIds.add(line.id)
      if (quantity !== line.quantity) updates.push({ line, quantity })
      continue
    }

    if (!requested.variantId) continue
    if (quantity < 1) continue
    additions.push({ variantId: requested.variantId, quantity })
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

  if (updates.length === 0 && additions.length === 0 && removals.length === 0) {
    if (input.shippingCents === undefined) {
      return { orderId, changed: false as const }
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

    // ── Quantity changes ────────────────────────────────────────────────
    for (const { line, quantity } of updates) {
      const delta = quantity - line.quantity

      if (line.variantId) {
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

      // The line's discount was agreed per unit, so it scales with the
      // quantity. Holding it flat would hand a bigger order the same money off
      // and turn a 10%-off line into 3%-off without anyone deciding to.
      const perUnitDiscount =
        line.quantity > 0
          ? Math.round(line.totalDiscountCents / line.quantity)
          : 0
      const discountCents = perUnitDiscount * quantity
      const gross = line.unitPriceCents * quantity
      const taxableBase = clampNonNegative(gross - discountCents)
      const previousBase = clampNonNegative(
        line.unitPriceCents * line.quantity - line.totalDiscountCents
      )
      const { taxLines, taxCents } = retaxLine(
        line.taxLines,
        taxableBase,
        pricesIncludeTax,
        { taxCents: line.taxTotalCents, base: previousBase }
      )

      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          quantity,
          totalDiscountCents: discountCents,
          taxTotalCents: taxCents,
          taxLines: taxLines as unknown as Prisma.InputJsonValue,
          totalCents: pricesIncludeTax ? taxableBase : taxableBase + taxCents,
        },
      })

      summary.push(`${line.title} ${line.quantity} → ${quantity}`)
    }

    // ── Additions ───────────────────────────────────────────────────────
    for (const addition of additions) {
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
      const applicableRates = variant.isTaxable
        ? taxRates.filter(
            (rate) => rate.taxCode === null || rate.taxCode === variant.taxCode
          )
        : []

      const taxLines: TaxLine[] = applicableRates.map((rate) => ({
        title: rate.name,
        rateBps: rate.rateBps,
        amountCents: pricesIncludeTax
          ? taxFromInclusive(gross, rate.rateBps)
          : applyBps(gross, rate.rateBps),
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
          totalDiscountCents: 0,
          taxTotalCents: taxCents,
          taxLines: taxLines as unknown as Prisma.InputJsonValue,
          totalCents: pricesIncludeTax ? gross : gross + taxCents,
          requiresShipping: variant.requiresShipping,
          weightGrams: variant.weightGrams,
        },
      })

      summary.push(
        `added ${addition.quantity} × ${variant.product.title}${
          variant.title && variant.title !== 'Default Title'
            ? ` (${variant.title})`
            : ''
        }`
      )
    }

    // ── Recompute the order's money from the lines that now exist ───────
    const lines = await tx.orderLine.findMany({
      where: { orderId },
      select: {
        quantity: true,
        unitPriceCents: true,
        totalDiscountCents: true,
        taxTotalCents: true,
      },
    })

    const subtotalCents = lines.reduce(
      (sum, line) => sum + line.unitPriceCents * line.quantity,
      0
    )
    const lineDiscountCents = lines.reduce(
      (sum, line) => sum + line.totalDiscountCents,
      0
    )
    const taxTotalCents = lines.reduce(
      (sum, line) => sum + line.taxTotalCents,
      0
    )

    const shippingTotalCents =
      input.shippingCents === undefined
        ? order.shippingTotalCents
        : clampNonNegative(Math.trunc(input.shippingCents))

    if (
      input.shippingCents !== undefined &&
      shippingTotalCents !== order.shippingTotalCents
    ) {
      summary.push(
        `delivery ${order.shippingTotalCents} → ${shippingTotalCents}`
      )
    }

    // Order-level discounts (a code applied at checkout) are not re-evaluated:
    // whether a code still qualifies depends on rules that may have changed or
    // been deleted since, and silently withdrawing a customer's discount on a
    // phone call is worse than carrying it. It is only clamped so it can never
    // exceed the goods it is discounting.
    //
    // The line-level portion is summed fresh above because it already scaled
    // with the quantities.
    const orderLevelDiscount = clampNonNegative(
      order.discountTotalCents -
        order.lines.reduce((sum, line) => sum + line.totalDiscountCents, 0)
    )
    const discountTotalCents = Math.min(
      subtotalCents,
      lineDiscountCents + orderLevelDiscount
    )

    const totalCents = clampNonNegative(
      subtotalCents - discountTotalCents + shippingTotalCents + taxTotalCents
    )

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
        subtotalCents,
        discountTotalCents,
        shippingTotalCents,
        taxTotalCents,
        totalCents,
        financialStatus,
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'order_edited',
        message: input.reason
          ? `Order edited — ${summary.join(', ')} (${input.reason})`
          : `Order edited — ${summary.join(', ')}`,
        actorUserId: session.user.id,
      },
    })

    return saved
  })

  await emitOrderWebhook(organizationId, orderId, 'ORDER_UPDATED')

  return { orderId, changed: true as const, order: updated }
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
