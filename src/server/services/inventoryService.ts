import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import type { PrismaClient } from '@/generated/prisma/client'
import type { AdjustInventoryInput } from '@/lib/validation/product'
import { emitWebhook } from '@/server/services/webhookService'
import {
  canReserve,
  getStock,
  isSellable,
  listProducts,
  releaseStock,
  reserveStock,
  splitBySource,
  isCatalogError,
  type CatalogProduct,
  type VariantRef,
} from '@/server/catalog'

/**
 * Stock, from both catalogues.
 *
 * A workspace sells from two places and its stock lives in both of them, so
 * this module does two different jobs and the difference between them is the
 * only thing worth understanding here.
 *
 * **Local products.** NCOM owns the rows: two integers per (location, variant),
 * moved by a conditional decrement inside the checkout transaction, with an
 * append-only ledger beside them. `available` is what can still be sold and
 * `committed` is what is promised to placed-but-unfulfilled orders; they move
 * together through an order's life:
 *
 *   order placed      available -= n,  committed += n
 *   order fulfilled                    committed -= n
 *   order cancelled   available += n,  committed -= n
 *   refund + restock  available += n
 *
 * This is the strong path. Two shoppers racing for the last unit cannot both
 * win, because the decrement and the check are one statement under a row lock.
 *
 * **Remote products.** NCOM owns nothing. It reads the merchant's count when
 * asked, and requests a hold when an order is placed — which their site may
 * refuse. Where a connector implements `/reserve`, that request is as strong as
 * the local decrement, because it is their database making the same call. Where
 * it does not, the check moments earlier is the whole guarantee and two
 * shoppers can both be sold the last unit, which the merchant resolves the way
 * they did before they had NCOM.
 *
 * Every movement function below therefore splits its lines by source and does
 * both jobs. Callers that already hold a resolution pass the source through
 * rather than making this look it up again.
 */

export type TransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0]

export interface StockLine {
  variantId: string
  quantity: number
}

/**
 * Availability for a set of references, from whichever catalogue owns them.
 *
 * Null means the line is not counted — an untracked local variant, or a remote
 * site that does not report stock — and is always sellable.
 */
export async function getAvailability(
  organizationId: string,
  refs: VariantRef[]
): Promise<Map<string, number | null>> {
  const stock = await getStock(organizationId, refs)
  return new Map([...stock].map(([id, state]) => [id, state.available]))
}

// ── Local stock: the rows NCOM owns ──────────────────────────────────────

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

// ── Remote stock: the numbers the merchant owns ──────────────────────────

/**
 * Asks the merchant's system to hold units for an order.
 *
 * Remote lines only, and called *outside* the checkout transaction: this is a
 * request across the internet, and holding a Postgres transaction open for the
 * length of it would put every checkout in the platform behind one merchant's
 * slow host.
 *
 * Returns whether anything is actually being held, so a caller can tell the
 * difference between "reserved" and "there is nothing here that reserves".
 * Throws when the site refuses — the units are not there, and the order that
 * would have taken them must not be written.
 */
export async function holdRemoteStock(
  organizationId: string,
  orderRef: string,
  lines: StockLine[]
): Promise<boolean> {
  if (lines.length === 0) return false
  if (!(await canReserve(organizationId))) return false

  const result = await reserveStock(organizationId, orderRef, lines)
  if (result.ok) return true

  const first = result.rejected[0]
  throw new Error(first?.reason ?? 'Some items are no longer in stock')
}

/**
 * Hands remote units back: a cancellation, a return, a checkout that failed
 * after the hold.
 *
 * Never throws. The order state that prompted this has already changed in NCOM,
 * and failing here would leave a merchant looking at a cancellation that did
 * not save. A stuck reservation is a number to correct on their side; it is
 * logged, and it is not a reason to refuse the cancellation.
 */
export async function returnRemoteStock(
  organizationId: string,
  orderRef: string,
  lines: StockLine[]
): Promise<void> {
  if (lines.length === 0) return

  try {
    await releaseStock(organizationId, orderRef, lines)
  } catch (error) {
    // Not implemented, or no website connected at all: both are ordinary states
    // rather than failures, and logging them would fill a local-only
    // workspace's logs with errors about a connector it never had.
    if (
      isCatalogError(error) &&
      (error.failure === 'unsupported' || error.failure === 'not_configured')
    ) {
      return
    }
    console.error('[inventory] could not return stock', orderRef, error)
  }
}

// ── Both at once ─────────────────────────────────────────────────────────

/**
 * Puts units back wherever they came from.
 *
 * The one entry point for "give this order's stock back", used by
 * cancellations, refunds, returns and refused parcels. Local lines go back
 * through the ledger; remote ones are released on the merchant's site. Neither
 * half can fail the caller: by the time anything calls this, the decision it
 * describes has already been made.
 */
export async function returnToStock(
  organizationId: string,
  orderRef: string,
  lines: StockLine[]
): Promise<void> {
  if (lines.length === 0) return

  const { local, remote } = await splitBySource(organizationId, lines)

  if (local.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        await releaseInventoryForOrder(
          tx,
          orderRef,
          local.map((line) => ({ ...line, inventoryTracked: true }))
        )
      })
    } catch (error) {
      console.error('[inventory] could not return local stock', orderRef, error)
    }
  }

  await returnRemoteStock(organizationId, orderRef, remote)
}

/**
 * Asks for units from wherever they live, for a movement that is not part of a
 * checkout — an order edit raising a quantity, say.
 *
 * Local lines move in their own transaction, remote ones over HTTP. A refusal
 * from either throws, and anything already taken in this call is handed back
 * first: a half-applied edit is a merchant looking at an order they cannot
 * ship.
 */
export async function holdForOrder(
  organizationId: string,
  orderRef: string,
  lines: StockLine[]
): Promise<boolean> {
  if (lines.length === 0) return false

  const { local, remote } = await splitBySource(organizationId, lines)

  let heldRemote = false
  if (remote.length > 0) {
    heldRemote = await holdRemoteStock(organizationId, orderRef, remote)
  }

  if (local.length === 0) return heldRemote

  try {
    await prisma.$transaction(async (tx) => {
      const tracked = await tx.productVariant.findMany({
        where: { id: { in: local.map((line) => line.variantId) } },
        select: { id: true, inventoryTracked: true, inventoryPolicy: true },
      })
      const byId = new Map(tracked.map((variant) => [variant.id, variant]))

      const result = await commitInventoryForOrder(
        tx,
        orderRef,
        local.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          inventoryTracked: byId.get(line.variantId)?.inventoryTracked ?? true,
          inventoryPolicy: byId.get(line.variantId)?.inventoryPolicy ?? 'DENY',
        }))
      )

      if (!result.ok) {
        throw new Error('Not enough stock left for one of these items')
      }
    })
  } catch (error) {
    // The local half failed, so the remote half is holding units for a change
    // that is not happening.
    if (heldRemote) await returnRemoteStock(organizationId, orderRef, remote)
    throw error
  }

  return true
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 5

export type InventoryStockFilter = 'all' | 'low' | 'out' | 'in'
export type InventorySort = 'product' | 'available-asc' | 'available-desc'

export interface InventoryRow {
  /** The variant id, ours or the merchant's. */
  id: string
  title: string
  sku: string | null
  barcode: string | null
  policy: 'DENY' | 'CONTINUE'
  productId: string
  productTitle: string
  imageUrl: string | null
  /** Null when nothing counts this line. */
  available: number | null
  /** Which catalogue it came from — only local rows can be edited here. */
  source: 'LOCAL' | 'REMOTE'
}

// ── The admin table ──────────────────────────────────────────────────────

/**
 * How much of a catalogue the stock screen will page through.
 *
 * The old table filtered and sorted in SQL over the whole catalogue. A remote
 * catalogue cannot be sorted by a column we do not have, so "lowest stock
 * first" means reading pages until there is enough to sort — and reading a
 * merchant's entire catalogue on every page view is not a thing to do to their
 * server. The ceiling is high enough for the shops this platform sells to and
 * low enough to stay polite, and the screen says plainly when it has been hit
 * rather than quietly reporting a total that is not one.
 */
const MAX_SCAN_PRODUCTS = 1000
const SCAN_PAGE_SIZE = 100

export async function listInventory(
  organizationId: string,
  options: {
    search?: string
    stock?: InventoryStockFilter
    sort?: InventorySort
    lowStockThreshold?: number
    take?: number
    skip?: number
  } = {}
): Promise<{ items: InventoryRow[]; total: number; truncated: boolean }> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const take = Math.min(Math.max(options.take ?? 50, 1), 250)
  const skip = Math.max(options.skip ?? 0, 0)
  const threshold = options.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD
  const search = options.search?.trim().toLowerCase()

  const { products, truncated } = await scanCatalogue(organizationId)

  let rows = products.flatMap((product) =>
    product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      barcode: variant.barcode,
      policy: variant.policy,
      productId: product.id,
      productTitle: product.title,
      imageUrl: variant.imageUrl ?? product.images[0]?.url ?? null,
      available: variant.available,
      source: product.source,
    }))
  )

  if (search) {
    // Matches product title, variant title, SKU and barcode. SKU especially:
    // it is what is printed on the box someone is holding while they search.
    rows = rows.filter((row) =>
      [row.productTitle, row.title, row.sku ?? '', row.barcode ?? '']
        .join(' ')
        .toLowerCase()
        .includes(search)
    )
  }

  const stockFilter = options.stock ?? 'all'
  if (stockFilter !== 'all') {
    rows = rows.filter((row) => {
      // An untracked line has no count to be low or out, and listing it as
      // "0 in stock" beside real counts would be actively misleading.
      if (row.available === null) return stockFilter === 'in'
      if (stockFilter === 'out') return row.available <= 0
      if (stockFilter === 'low')
        return row.available > 0 && row.available <= threshold
      return row.available > 0
    })
  }

  const sort = options.sort ?? 'product'
  rows.sort((a, b) => {
    if (sort === 'available-asc' || sort === 'available-desc') {
      // Untracked lines sort last either way: they are not a stock number, and
      // putting "unlimited" at the top of "lowest first" buries the shortage
      // the merchant opened this screen to find.
      if (a.available === null || b.available === null) {
        return (a.available === null ? 1 : 0) - (b.available === null ? 1 : 0)
      }
      return sort === 'available-asc'
        ? a.available - b.available
        : b.available - a.available
    }
    return (
      a.productTitle.localeCompare(b.productTitle) ||
      a.title.localeCompare(b.title)
    )
  })

  return {
    items: rows.slice(skip, skip + take),
    total: rows.length,
    truncated,
  }
}

export async function getInventorySummary(organizationId: string): Promise<{
  tracked: number
  low: number
  out: number
  truncated: boolean
}> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const { products, truncated } = await scanCatalogue(organizationId)

  let tracked = 0
  let low = 0
  let out = 0

  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.available === null) continue
      tracked += 1
      if (variant.available <= 0) out += 1
      else if (variant.available <= DEFAULT_LOW_STOCK_THRESHOLD) low += 1
    }
  }

  return { tracked, low, out, truncated }
}

/** Whether a variant can be sold right now, for one-off checks. */
export async function isVariantSellable(
  organizationId: string,
  ref: VariantRef,
  quantity = 1
): Promise<boolean> {
  const stock = await getStock(organizationId, [ref])
  const state = stock.get(ref.variantId)
  return state ? isSellable(state, quantity) : false
}

/**
 * Pages through the connected catalogue, once per request.
 *
 * Deliberately not memoised beyond the request: two admins looking at the stock
 * screen are two reads of the merchant's site, and that is the arrangement.
 */
async function scanCatalogue(
  organizationId: string
): Promise<{ products: CatalogProduct[]; truncated: boolean }> {
  const products: CatalogProduct[] = []
  let cursor: string | null = null

  while (products.length < MAX_SCAN_PRODUCTS) {
    const page = await listProducts(organizationId, {
      limit: SCAN_PAGE_SIZE,
      cursor,
      includeDrafts: true,
    })

    products.push(...page.products)

    if (!page.nextCursor || page.products.length === 0) {
      return { products, truncated: false }
    }
    cursor = page.nextCursor
  }

  return { products, truncated: true }
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
