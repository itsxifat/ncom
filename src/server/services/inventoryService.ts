import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import type { PrismaClient } from '@/generated/prisma/client'
import type { AdjustInventoryInput } from '@/lib/validation/product'

/**
 * Inventory.
 *
 * Two numbers per (location, variant): `available` is what can still be sold,
 * `committed` is what is promised to placed-but-unfulfilled orders. They move
 * together through an order's life:
 *
 *   order placed      available -= n,  committed += n
 *   order fulfilled                    committed -= n
 *   order cancelled   available += n,  committed -= n
 *   refund + restock  available += n
 *
 * Keeping them separate is what lets the storefront show honest availability
 * while a warehouse still physically holds stock it has not shipped.
 *
 * Every mutation writes an InventoryAdjustment row. The ledger is the only way
 * to answer "how did this variant get to -3", which is the first question
 * asked in any stock dispute and is unanswerable from the levels alone.
 */

export type TransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0]

/** Sums availability across locations for a set of variants. */
export async function getAvailability(
  variantIds: string[]
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map()

  const levels = await prisma.inventoryLevel.groupBy({
    by: ['variantId'],
    where: { variantId: { in: variantIds } },
    _sum: { available: true },
  })

  return new Map(
    levels.map((level) => [level.variantId, level._sum.available ?? 0])
  )
}

/**
 * Reserves stock for an order, atomically.
 *
 * The conditional `updateMany` is the whole point: it compiles to
 * `UPDATE ... SET available = available - n WHERE available >= n`, so the
 * check and the decrement happen in one statement under the row lock. Reading
 * the level first and then writing it — the obvious implementation — lets two
 * concurrent checkouts both read "1 in stock" and both succeed, which is how
 * stores oversell their last unit. A zero row count means someone else won the
 * race, and the caller must fail the checkout.
 *
 * Must be called inside the checkout transaction so a later failure rolls the
 * reservation back with it.
 */
export async function commitInventoryForOrder(
  tx: TransactionClient,
  orderId: string,
  lines: {
    variantId: string
    quantity: number
    inventoryTracked: boolean
    inventoryPolicy: 'DENY' | 'CONTINUE'
  }[]
): Promise<{ ok: true } | { ok: false; variantId: string }> {
  for (const line of lines) {
    if (!line.inventoryTracked) continue

    const level = await tx.inventoryLevel.findFirst({
      where: { variantId: line.variantId },
      orderBy: { available: 'desc' },
      select: { id: true },
    })

    // No level row at all means stock was never stocked at any location.
    // Backorder-allowed variants proceed; DENY variants cannot.
    if (!level) {
      if (line.inventoryPolicy === 'CONTINUE') continue
      return { ok: false, variantId: line.variantId }
    }

    if (line.inventoryPolicy === 'CONTINUE') {
      // Backorders are allowed to drive `available` negative — that negative
      // number is the backlog, and hiding it would lose the information.
      await tx.inventoryLevel.update({
        where: { id: level.id },
        data: {
          available: { decrement: line.quantity },
          committed: { increment: line.quantity },
        },
      })
    } else {
      const updated = await tx.inventoryLevel.updateMany({
        where: { id: level.id, available: { gte: line.quantity } },
        data: {
          available: { decrement: line.quantity },
          committed: { increment: line.quantity },
        },
      })

      if (updated.count === 0) {
        return { ok: false, variantId: line.variantId }
      }
    }

    await tx.inventoryAdjustment.create({
      data: {
        locationId: (
          await tx.inventoryLevel.findUniqueOrThrow({
            where: { id: level.id },
            select: { locationId: true },
          })
        ).locationId,
        variantId: line.variantId,
        delta: -line.quantity,
        reason: 'ORDER_PLACED',
        referenceId: orderId,
      },
    })
  }

  return { ok: true }
}

/** Releases a cancelled order's reservation back to available stock. */
export async function releaseInventoryForOrder(
  tx: TransactionClient,
  orderId: string,
  lines: { variantId: string; quantity: number; inventoryTracked: boolean }[]
) {
  for (const line of lines) {
    if (!line.inventoryTracked) continue

    const level = await tx.inventoryLevel.findFirst({
      where: { variantId: line.variantId },
      select: { id: true, locationId: true },
    })
    if (!level) continue

    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: {
        available: { increment: line.quantity },
        committed: { decrement: line.quantity },
      },
    })

    await tx.inventoryAdjustment.create({
      data: {
        locationId: level.locationId,
        variantId: line.variantId,
        delta: line.quantity,
        reason: 'ORDER_CANCELLED',
        referenceId: orderId,
      },
    })
  }
}

/**
 * Consumes committed stock when goods actually ship. `available` is untouched
 * — it was already decremented at order time.
 */
export async function consumeInventoryForFulfillment(
  tx: TransactionClient,
  fulfillmentId: string,
  locationId: string | null,
  lines: { variantId: string; quantity: number; inventoryTracked: boolean }[]
) {
  for (const line of lines) {
    if (!line.inventoryTracked) continue

    const level = await tx.inventoryLevel.findFirst({
      where: {
        variantId: line.variantId,
        ...(locationId ? { locationId } : {}),
      },
      select: { id: true, locationId: true },
    })
    if (!level) continue

    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: { committed: { decrement: line.quantity } },
    })

    await tx.inventoryAdjustment.create({
      data: {
        locationId: level.locationId,
        variantId: line.variantId,
        delta: 0,
        reason: 'FULFILLED',
        referenceId: fulfillmentId,
      },
    })
  }
}

/** Returns refunded goods to sellable stock. */
export async function restockInventory(
  tx: TransactionClient,
  refundId: string,
  lines: { variantId: string; quantity: number }[]
) {
  for (const line of lines) {
    const level = await tx.inventoryLevel.findFirst({
      where: { variantId: line.variantId },
      select: { id: true, locationId: true },
    })
    if (!level) continue

    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: { available: { increment: line.quantity } },
    })

    await tx.inventoryAdjustment.create({
      data: {
        locationId: level.locationId,
        variantId: line.variantId,
        delta: line.quantity,
        reason: 'REFUND',
        referenceId: refundId,
      },
    })
  }
}

/**
 * Merchant-initiated stock change.
 *
 * Takes a signed delta rather than an absolute count on purpose: two staff
 * members receiving shipments at the same time should add 10 and add 5 and end
 * at +15, whereas two absolute writes would silently discard one of them.
 */
export async function adjustInventory(
  organizationId: string,
  input: AdjustInventoryInput,
  actorUserId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const [location, variant] = await Promise.all([
    prisma.location.findFirst({
      where: { id: input.locationId, organizationId },
      select: { id: true },
    }),
    prisma.productVariant.findFirst({
      where: {
        id: input.variantId,
        product: { organizationId },
      },
      select: { id: true },
    }),
  ])

  if (!location) throw new Error('Location not found')
  if (!variant) throw new Error('Variant not found')

  return prisma.$transaction(async (tx) => {
    const level = await tx.inventoryLevel.upsert({
      where: {
        locationId_variantId: {
          locationId: input.locationId,
          variantId: input.variantId,
        },
      },
      create: {
        locationId: input.locationId,
        variantId: input.variantId,
        available: input.delta,
        committed: 0,
      },
      update: { available: { increment: input.delta } },
    })

    await tx.inventoryAdjustment.create({
      data: {
        locationId: input.locationId,
        variantId: input.variantId,
        delta: input.delta,
        reason: input.reason,
        note: input.note ?? null,
        actorUserId,
      },
    })

    return level
  })
}

/**
 * Sets a variant's stock to an absolute number at the organisation's default
 * location.
 *
 * Merchants count stock, they do not compute deltas: standing in front of a
 * shelf the true statement is "there are 42", not "there are eleven more than
 * whatever the system last thought". This converts that to the signed
 * adjustment the ledger records, so counting a shelf still leaves a full audit
 * trail rather than overwriting history with a bare number.
 *
 * Returns null when the variant does not track inventory — those are
 * infinitely available and have no level to set, and silently creating one
 * would make the product look limited when it is not.
 */
export async function setVariantStock(
  organizationId: string,
  variantId: string,
  available: number,
  actorUserId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, product: { organizationId } },
    select: { id: true, inventoryTracked: true },
  })
  if (!variant) throw new Error('Variant not found')
  if (!variant.inventoryTracked) return null

  const location = await ensureDefaultLocation(organizationId)

  const current = await prisma.inventoryLevel.findUnique({
    where: {
      locationId_variantId: { locationId: location.id, variantId },
    },
    select: { available: true },
  })

  const target = Math.max(0, Math.round(available))
  const delta = target - (current?.available ?? 0)
  if (delta === 0) return current ?? { available: target }

  return adjustInventory(
    organizationId,
    {
      variantId,
      locationId: location.id,
      delta,
      // A typed-in count is a stock take, not a receipt or a write-off.
      reason: 'CORRECTION',
      note: 'Set from the product editor',
    },
    actorUserId
  )
}

/**
 * Ensures a store has somewhere to hold stock.
 *
 * Called on first use rather than at store creation so that landing-page
 * stores never accrue commerce rows they will not use.
 */
export async function ensureDefaultLocation(
  organizationId: string,
  name = 'Default location'
) {
  const existing = await prisma.location.findFirst({
    where: { organizationId },
    select: { id: true },
  })
  if (existing) return existing

  return prisma.location.create({
    data: { organizationId, name },
    select: { id: true },
  })
}

/**
 * Inventory levels for the admin table: one row per tracked variant, with its
 * per-location counts.
 *
 * Untracked variants are excluded rather than shown with a zero — they are
 * infinitely available, and listing them as "0 in stock" beside real counts is
 * actively misleading.
 */
export async function listInventory(
  organizationId: string,
  options: {
    search?: string
    lowStockOnly?: boolean
    take?: number
    skip?: number
  } = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const where = {
    inventoryTracked: true,
    product: {
      organizationId,
      ...(options.search
        ? { title: { contains: options.search, mode: 'insensitive' as const } }
        : {}),
    },
  }

  const [items, total] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      select: {
        id: true,
        title: true,
        sku: true,
        inventoryPolicy: true,
        product: { select: { id: true, title: true } },
        inventoryLevels: {
          select: {
            id: true,
            available: true,
            committed: true,
            location: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ product: { title: 'asc' } }, { position: 'asc' }],
      take: options.take ?? 100,
      skip: options.skip ?? 0,
    }),
    prisma.productVariant.count({ where }),
  ])

  const rows = items.map((variant) => ({
    ...variant,
    totalAvailable: variant.inventoryLevels.reduce(
      (sum, level) => sum + level.available,
      0
    ),
    totalCommitted: variant.inventoryLevels.reduce(
      (sum, level) => sum + level.committed,
      0
    ),
  }))

  // Filtered after the query rather than in it: the threshold applies to the
  // sum across locations, which Prisma cannot express as a `where` on the
  // variant. Correct for the page sizes this table uses.
  return {
    items: options.lowStockOnly
      ? rows.filter((row) => row.totalAvailable <= 5)
      : rows,
    total,
  }
}
