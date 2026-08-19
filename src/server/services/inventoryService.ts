import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { Prisma, type PrismaClient } from '@/generated/prisma/client'
import type { AdjustInventoryInput } from '@/lib/validation/product'
import { emitWebhook } from '@/server/services/webhookService'

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
      select: { id: true, locationId: true },
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
        locationId: level.locationId,
        variantId: line.variantId,
        delta: -line.quantity,
        reason: 'ORDER_PLACED',
        referenceId: orderId,
      },
    })
  }

  return { ok: true }
}

/**
 * Releases a cancelled order's reservation back to available stock.
 *
 * The level is chosen by where the stock is actually *committed*, not by
 * whichever row the database happened to return first. In a multi-location
 * store those differ: the order reserved from the warehouse that had stock, and
 * returning the units to a different shop's shelf would leave both counts wrong
 * — one permanently over, one permanently negative — with nothing in the ledger
 * to explain it.
 */
export async function releaseInventoryForOrder(
  tx: TransactionClient,
  orderId: string,
  lines: { variantId: string; quantity: number; inventoryTracked: boolean }[]
) {
  for (const line of lines) {
    if (!line.inventoryTracked) continue

    const level = await levelHoldingCommitment(tx, line.variantId)
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
 * The level a variant's reservation is most likely held at: the one with the
 * largest committed count, falling back to the largest available when nothing
 * is committed (an already-fulfilled line being returned, say).
 *
 * Reservations do not record which level they came from — commitInventoryForOrder
 * writes an InventoryAdjustment naming the location, but a partial release has
 * no single row to point at. Picking the location with the outstanding
 * commitment reconstructs it correctly for the single-location stores that are
 * the overwhelming majority, and picks the most plausible one otherwise.
 */
async function levelHoldingCommitment(
  tx: TransactionClient,
  variantId: string
) {
  const committed = await tx.inventoryLevel.findFirst({
    where: { variantId, committed: { gt: 0 } },
    orderBy: { committed: 'desc' },
    select: { id: true, locationId: true },
  })
  if (committed) return committed

  return tx.inventoryLevel.findFirst({
    where: { variantId },
    orderBy: { available: 'desc' },
    select: { id: true, locationId: true },
  })
}

/**
 * Consumes committed stock when goods actually ship. `available` is untouched
 * — it was already decremented at order time.
 */
export async function consumeCommittedStock(
  tx: TransactionClient,
  referenceId: string,
  locationId: string | null,
  lines: { variantId: string; quantity: number; inventoryTracked: boolean }[]
) {
  for (const line of lines) {
    if (!line.inventoryTracked) continue

    const level = locationId
      ? await tx.inventoryLevel.findFirst({
          where: { variantId: line.variantId, locationId },
          select: { id: true, locationId: true },
        })
      : await levelHoldingCommitment(tx, line.variantId)
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
        referenceId,
      },
    })
  }
}

/**
 * The one location a store's stock lives in.
 *
 * A store may name its own; otherwise it falls back to the organisation's first
 * active location. The fallback is what lets a merchant sell before they have
 * ever opened inventory settings — the alternative is a store that cannot
 * decrement stock because nobody told it where the stock is.
 *
 * Returns null when the organisation has no location at all, which callers
 * treat as "no stock to move" rather than as an error: an untracked catalogue
 * is a legitimate way to run a store.
 */
export async function resolveStoreLocationId(
  tx: TransactionClient,
  organizationId: string,
  storeId: string | null
): Promise<string | null> {
  if (storeId) {
    const store = await tx.store.findFirst({
      where: { id: storeId, organizationId },
      select: { inventoryLocationId: true },
    })
    if (store?.inventoryLocationId) return store.inventoryLocationId
  }

  const fallback = await tx.location.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  return fallback?.id ?? null
}

/**
 * Returns refunded goods to sellable stock.
 *
 * Untracked variants are skipped: they have no meaningful count, and a level row
 * left over from before tracking was switched off would otherwise accumulate
 * phantom stock that the storefront ignores and the merchant cannot explain.
 */
export async function restockInventory(
  tx: TransactionClient,
  refundId: string,
  lines: { variantId: string; quantity: number }[]
) {
  if (lines.length === 0) return

  const tracked = new Set(
    (
      await tx.productVariant.findMany({
        where: {
          id: { in: lines.map((line) => line.variantId) },
          inventoryTracked: true,
        },
        select: { id: true },
      })
    ).map((variant) => variant.id)
  )

  for (const line of lines) {
    if (!tracked.has(line.variantId)) continue

    const level = await tx.inventoryLevel.findFirst({
      where: { variantId: line.variantId },
      orderBy: { available: 'desc' },
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
 *
 * A delta that would push `available` below zero is clamped and reported rather
 * than applied. Negative availability has exactly one legitimate meaning here —
 * a backorder backlog created by a CONTINUE sale — and letting a typo ("-100"
 * for "-1") manufacture one makes the storefront refuse to sell stock that is
 * sitting on the shelf, with no obvious way for the merchant to see why.
 */
export async function adjustInventory(
  organizationId: string,
  input: AdjustInventoryInput,
  // Null for an API key: a key is authorised to move stock but is not a person,
  // and writing its creator's id here would put a name in the ledger next to a
  // change they did not make.
  actorUserId: string | null
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  if (input.delta === 0) {
    throw new Error('Enter how many units to add or remove')
  }

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
      select: { id: true, productId: true, inventoryTracked: true },
    }),
  ])

  if (!location) throw new Error('Location not found')
  if (!variant) throw new Error('Variant not found')
  if (!variant.inventoryTracked) {
    throw new Error(
      'This variant does not track inventory — switch tracking on before adjusting stock'
    )
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.inventoryLevel.findUnique({
      where: {
        locationId_variantId: {
          locationId: input.locationId,
          variantId: input.variantId,
        },
      },
      select: { available: true },
    })

    const before = current?.available ?? 0
    const applied = Math.max(input.delta, -before)

    if (applied === 0) {
      throw new Error(
        before === 0
          ? 'There is no stock at this location to remove'
          : `Only ${before} in stock at this location`
      )
    }

    const updated = await tx.inventoryLevel.upsert({
      where: {
        locationId_variantId: {
          locationId: input.locationId,
          variantId: input.variantId,
        },
      },
      create: {
        locationId: input.locationId,
        variantId: input.variantId,
        available: applied,
        committed: 0,
      },
      update: { available: { increment: applied } },
    })

    await tx.inventoryAdjustment.create({
      data: {
        locationId: input.locationId,
        variantId: input.variantId,
        delta: applied,
        reason: input.reason,
        note: input.note ?? null,
        actorUserId,
      },
    })

    return {
      level: updated,
      requestedDelta: input.delta,
      appliedDelta: applied,
      availableBefore: before,
      availableAfter: updated.available,
    }
  })

  await notifyInventoryChanged(organizationId, input.variantId)

  return result
}

/**
 * Tells subscribers a variant's sellable count moved.
 *
 * Sent after the transaction commits, never inside it: a webhook receiver that
 * calls straight back to read the new stock must not see the old number, and a
 * slow HTTP handshake must not hold a database write open.
 */
async function notifyInventoryChanged(
  organizationId: string,
  variantId: string
) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      title: true,
      inventoryPolicy: true,
      product: { select: { id: true, title: true, handle: true } },
      inventoryLevels: {
        select: {
          available: true,
          committed: true,
          location: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!variant) return

  const available = variant.inventoryLevels.reduce(
    (sum, level) => sum + level.available,
    0
  )
  const committed = variant.inventoryLevels.reduce(
    (sum, level) => sum + level.committed,
    0
  )

  await emitWebhook(organizationId, 'INVENTORY_UPDATED', {
    product: {
      id: variant.product.id,
      title: variant.product.title,
      handle: variant.product.handle,
    },
    variant: {
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      inventoryPolicy: variant.inventoryPolicy,
    },
    available,
    committed,
    locations: variant.inventoryLevels.map((level) => ({
      id: level.location.id,
      name: level.location.name,
      available: level.available,
      committed: level.committed,
    })),
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
  actorUserId: string | null,
  options: { locationId?: string; note?: string } = {}
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const { note } = options

  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, product: { organizationId } },
    select: { id: true, inventoryTracked: true },
  })
  if (!variant) throw new Error('Variant not found')
  if (!variant.inventoryTracked) return null

  const location = options.locationId
    ? await prisma.location.findFirst({
        where: { id: options.locationId, organizationId },
        select: { id: true },
      })
    : await ensureDefaultLocation(organizationId)

  if (!location) throw new Error('Location not found')

  const current = await prisma.inventoryLevel.findUnique({
    where: {
      locationId_variantId: { locationId: location.id, variantId },
    },
    select: { available: true },
  })

  const requested = Math.round(available)
  const target = Math.max(0, requested)
  const before = current?.available ?? 0
  const delta = target - before

  if (delta === 0) {
    return {
      available: target,
      availableBefore: before,
      requested,
      clamped: requested !== target,
    }
  }

  const result = await adjustInventory(
    organizationId,
    {
      variantId,
      locationId: location.id,
      delta,
      // A typed-in count is a stock take, not a receipt or a write-off.
      reason: 'CORRECTION',
      note: note ?? 'Set from the product editor',
    },
    actorUserId
  )

  return {
    available: result.availableAfter,
    availableBefore: before,
    requested,
    // A negative count asked for is not achievable — the caller is told what
    // actually happened rather than being handed back the number they sent.
    clamped: requested !== result.availableAfter,
  }
}

/**
 * Ensures a store has somewhere to hold stock.
 *
 * Called on first use rather than at store creation so that landing-page
 * stores never accrue commerce rows they will not use.
 *
 * Ordered by creation, so "the default location" is the same row every time it
 * is asked for. An unordered findFirst let the product editor write a count to
 * one warehouse and the inventory page read it from another, which reads as
 * stock that saves and then disappears.
 */
export async function ensureDefaultLocation(
  organizationId: string,
  name = 'Default location'
) {
  const existing = await prisma.location.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (existing) return existing

  // An org whose only locations are deactivated still needs somewhere to count
  // stock; reuse the oldest rather than creating a second "Default location".
  const inactive = await prisma.location.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (inactive) return inactive

  return prisma.location.create({
    data: { organizationId, name },
    select: { id: true },
  })
}

/** What counts as "running low" when the merchant has not said otherwise. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5

export type InventoryStockFilter = 'all' | 'low' | 'out' | 'in'

export type InventorySort =
  'product' | 'available-asc' | 'available-desc' | 'updated'

export interface InventoryRow {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  inventoryPolicy: 'DENY' | 'CONTINUE'
  productId: string
  productTitle: string
  imageUrl: string | null
  totalAvailable: number
  totalCommitted: number
  levels: {
    locationId: string
    locationName: string
    available: number
    committed: number
  }[]
}

/**
 * Inventory levels for the admin table: one row per tracked variant, with its
 * per-location counts.
 *
 * Untracked variants are excluded rather than shown with a zero — they are
 * infinitely available, and listing them as "0 in stock" beside real counts is
 * actively misleading.
 *
 * The stock filter and the sort both run in SQL, over `SUM(available)` across
 * locations, so they see the whole catalogue. Doing this in JavaScript after
 * the query — the previous implementation — meant "low stock only" filtered
 * one page of results and silently hid every low variant past the first
 * hundred, which is precisely the set the merchant opened the page to find. It
 * also reported a total that ignored the filter, so the pager disagreed with
 * the rows underneath it.
 *
 * A variant with no InventoryLevel rows at all sums to zero via the LEFT JOIN
 * rather than dropping out, because "never stocked" and "sold out" are the same
 * thing to a shopper and both belong under Out of stock.
 */
export async function listInventory(
  organizationId: string,
  options: {
    search?: string
    stock?: InventoryStockFilter
    locationId?: string
    sort?: InventorySort
    lowStockThreshold?: number
    take?: number
    skip?: number
  } = {}
): Promise<{ items: InventoryRow[]; total: number }> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const take = Math.min(Math.max(options.take ?? 50, 1), 250)
  const skip = Math.max(options.skip ?? 0, 0)
  const threshold = options.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD

  const search = options.search?.trim()
  // Matches product title, variant title, SKU and barcode. SKU especially:
  // it is what is printed on the box someone is holding while they search.
  const searchClause = search
    ? Prisma.sql`AND (
        p."title" ILIKE ${'%' + search + '%'}
        OR v."title" ILIKE ${'%' + search + '%'}
        OR v."sku" ILIKE ${'%' + search + '%'}
        OR v."barcode" ILIKE ${'%' + search + '%'}
      )`
    : Prisma.empty

  // Scoping the join (rather than the WHERE) keeps variants with no row at this
  // location in the result at zero, instead of dropping them from the table the
  // merchant is using to find exactly those gaps.
  const locationClause = options.locationId
    ? Prisma.sql`AND l."locationId" = ${options.locationId}`
    : Prisma.empty

  const havingClause = (() => {
    switch (options.stock) {
      case 'low':
        return Prisma.sql`HAVING COALESCE(SUM(l."available"), 0) > 0
                            AND COALESCE(SUM(l."available"), 0) <= ${threshold}`
      case 'out':
        return Prisma.sql`HAVING COALESCE(SUM(l."available"), 0) <= 0`
      case 'in':
        return Prisma.sql`HAVING COALESCE(SUM(l."available"), 0) > ${threshold}`
      default:
        return Prisma.empty
    }
  })()

  // Every branch ends on v."id" because this query is paged with LIMIT/OFFSET,
  // and OFFSET only means anything under a *total* order. Title and position are
  // both far from unique — a catalogue with thirty products called "Hawaiian
  // Shirt" leaves Postgres free to return tied rows in a different order per
  // page, so a client walking the pages sees some variants twice and never sees
  // others at all. That reads as phantom stock drift, which is exactly the kind
  // of bug nobody suspects the paging for.
  const orderClause = (() => {
    switch (options.sort) {
      case 'available-asc':
        return Prisma.sql`ORDER BY COALESCE(SUM(l."available"), 0) ASC, p."title" ASC, v."position" ASC, v."id" ASC`
      case 'available-desc':
        return Prisma.sql`ORDER BY COALESCE(SUM(l."available"), 0) DESC, p."title" ASC, v."position" ASC, v."id" ASC`
      case 'updated':
        return Prisma.sql`ORDER BY MAX(v."updatedAt") DESC, v."position" ASC, v."id" ASC`
      default:
        return Prisma.sql`ORDER BY p."title" ASC, v."position" ASC, v."id" ASC`
    }
  })()

  const baseFrom = Prisma.sql`
    FROM "ProductVariant" v
    JOIN "Product" p ON p."id" = v."productId"
    LEFT JOIN "InventoryLevel" l ON l."variantId" = v."id" ${locationClause}
    WHERE p."organizationId" = ${organizationId}
      AND v."inventoryTracked" = true
      ${searchClause}
    GROUP BY v."id", p."id"
    ${havingClause}
  `

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<
      { id: string; total_available: bigint; total_committed: bigint }[]
    >`
      SELECT v."id",
             COALESCE(SUM(l."available"), 0) AS total_available,
             COALESCE(SUM(l."committed"), 0) AS total_committed
      ${baseFrom}
      ${orderClause}
      LIMIT ${take} OFFSET ${skip}
    `,
    // The grouped query has one row per variant, so counting it needs a wrapper
    // — COUNT(*) inside the group would count locations.
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT v."id" ${baseFrom}
      ) AS matched
    `,
  ])

  const total = Number(totals[0]?.count ?? 0)
  if (rows.length === 0) return { items: [], total }

  const ids = rows.map((row) => row.id)
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      sku: true,
      barcode: true,
      inventoryPolicy: true,
      product: {
        select: {
          id: true,
          title: true,
          images: {
            orderBy: { position: 'asc' },
            take: 1,
            select: { media: { select: { url: true } } },
          },
        },
      },
      inventoryLevels: {
        select: {
          available: true,
          committed: true,
          location: { select: { id: true, name: true } },
        },
      },
    },
  })

  const byId = new Map(variants.map((variant) => [variant.id, variant]))

  // Re-projected in the raw query's order: `findMany` with an `in` filter makes
  // no ordering promise, and re-sorting here would undo the SQL sort.
  return {
    items: rows.flatMap((row) => {
      const variant = byId.get(row.id)
      if (!variant) return []

      return [
        {
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          inventoryPolicy: variant.inventoryPolicy,
          productId: variant.product.id,
          productTitle: variant.product.title,
          imageUrl: variant.product.images[0]?.media.url ?? null,
          totalAvailable: Number(row.total_available),
          totalCommitted: Number(row.total_committed),
          levels: variant.inventoryLevels.map((level) => ({
            locationId: level.location.id,
            locationName: level.location.name,
            available: level.available,
            committed: level.committed,
          })),
        },
      ]
    }),
    total,
  }
}

/**
 * Headline counts for the inventory page.
 *
 * Computed over the whole catalogue rather than the current page, because their
 * only job is to tell the merchant whether the page they are looking at is
 * hiding a problem — "3 out of stock" beside a filtered table is the prompt to
 * go and look.
 */
export async function getInventorySummary(
  organizationId: string,
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const [row] = await prisma.$queryRaw<
    { tracked: bigint; low: bigint; out: bigint; committed: bigint }[]
  >`
    SELECT
      COUNT(*)::bigint AS tracked,
      COUNT(*) FILTER (WHERE available > 0 AND available <= ${lowStockThreshold})::bigint AS low,
      COUNT(*) FILTER (WHERE available <= 0)::bigint AS out,
      COALESCE(SUM(committed), 0)::bigint AS committed
    FROM (
      SELECT COALESCE(SUM(l."available"), 0) AS available,
             COALESCE(SUM(l."committed"), 0) AS committed
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      LEFT JOIN "InventoryLevel" l ON l."variantId" = v."id"
      WHERE p."organizationId" = ${organizationId}
        AND v."inventoryTracked" = true
      GROUP BY v."id"
    ) AS per_variant
  `

  return {
    tracked: Number(row?.tracked ?? 0),
    low: Number(row?.low ?? 0),
    out: Number(row?.out ?? 0),
    committed: Number(row?.committed ?? 0),
  }
}

/**
 * The last movements for a variant, newest first.
 *
 * The ledger is written on every change but was never readable anywhere, which
 * left "why is this 3?" answerable only by reading the database directly.
 */
export async function listInventoryHistory(
  organizationId: string,
  variantId: string,
  take = 25
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, product: { organizationId } },
    select: { id: true },
  })
  if (!variant) throw new Error('Variant not found')

  const entries = await prisma.inventoryAdjustment.findMany({
    where: { variantId },
    orderBy: { createdAt: 'desc' },
    take,
  })

  const locations = await prisma.location.findMany({
    where: { id: { in: entries.map((entry) => entry.locationId) } },
    select: { id: true, name: true },
  })
  const locationName = new Map(
    locations.map((location) => [location.id, location.name])
  )

  return entries.map((entry) => ({
    id: entry.id,
    delta: entry.delta,
    reason: entry.reason,
    note: entry.note,
    referenceId: entry.referenceId,
    createdAt: entry.createdAt,
    locationName: locationName.get(entry.locationId) ?? 'Unknown location',
  }))
}
