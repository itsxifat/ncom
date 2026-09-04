import 'server-only'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { Prisma } from '@/generated/prisma/client'
import type { StockMovementLine } from './types'

/**
 * One shirt, two shoppers.
 *
 * NCOM's own stock does not need this file. `commitInventoryForOrder` takes
 * units with `UPDATE … SET available = available - n WHERE available >= n`
 * inside the checkout transaction; Postgres decides who gets the last one, and
 * the loser's whole order rolls back. There is no window.
 *
 * Stock on a merchant's own website has one, and it is unavoidable. Taking a
 * unit there means: read their number over HTTP, decide, and record what we
 * took. Three steps, with someone else's server in the middle. Two checkouts
 * interleaving across them both read "1 available" and both write an order.
 *
 * So this module supplies the two things that close it.
 *
 *   **A queue.** {@link withStockLock} makes the read-decide-record sequence
 *   run one at a time per variant. Not per order and not per workspace — two
 *   people buying different products never wait on each other, and only the
 *   ones actually competing for the same last unit are serialised.
 *
 *   **A memory.** A lock alone is not enough, because the merchant's number
 *   does not move when we sell. Their system finds out when it processes the
 *   order webhook, which may be minutes away; until then their connector keeps
 *   reporting the unit we just sold. {@link outstandingHolds} is what the
 *   second shopper's read subtracts, so the queue is deciding on a true figure
 *   rather than politely taking turns to read the same stale one.
 *
 * Where the site implements `/reserve`, the reserve call happens inside the
 * lock and their number moves immediately — those holds are recorded
 * `CONFIRMED` and subtracted from nothing, because subtracting a unit their
 * count has already removed would be counting it twice.
 */

/** Longest a lease is ever held, and the ceiling on how long a rival waits. */
const DEFAULT_LEASE_MS = 15_000

/** How long a checkout will queue for a variant before giving up on it. */
const DEFAULT_WAIT_MS = 12_000

/** Poll interval while queueing, before jitter. */
const RETRY_MS = 40

/**
 * How long NCOM keeps subtracting a hold the merchant has not confirmed.
 *
 * The window in which their own bookkeeping is expected to catch up with the
 * order webhook. Too short and a second shopper is sold a unit that is already
 * gone; too long and the shop under-sells stock the merchant has since
 * accounted for. Fifteen minutes is comfortably longer than any event-driven
 * sync and short enough that a missed webhook costs a quarter of an hour of
 * pessimism rather than a permanently understated shelf.
 */
export const HOLD_TTL_MS = 15 * 60 * 1000

export class StockQueueTimeoutError extends Error {
  readonly isStockQueueTimeout = true as const

  constructor() {
    super(
      'Too many people are checking out this item right now. Try again in a moment.'
    )
    this.name = 'StockQueueTimeoutError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function lockKey(organizationId: string, variantId: string): string {
  return `${organizationId}:${variantId}`
}

/**
 * Every timestamp in this statement, in the units the column is actually in.
 *
 * `expiresAt` is a `timestamp without time zone` holding UTC, because that is
 * what Prisma writes into a `DateTime`. Bare `now()` is a `timestamptz`, and
 * comparing the two makes Postgres render it in the *session's* zone — on a
 * server set to Asia/Dhaka that is UTC+6, so every lease looked six hours
 * expired and the lock excluded nobody. Five of six concurrent checkouts walked
 * straight through it. Naming the zone explicitly is what makes the comparison
 * mean what it reads as, wherever the database happens to be configured.
 */
const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'utc')`

/**
 * Takes one lease, or reports that someone else holds it.
 *
 * The conditional upsert is the whole mechanism: the primary key means two
 * inserts of the same key cannot both succeed, and `WHERE expiresAt < now()`
 * means the update arm only fires for a lease that has lapsed. A live lock
 * therefore matches nothing, updates nothing, and returns no row — which is how
 * the caller learns to wait. A dead one is taken over in the same statement, so
 * a process that crashed mid-checkout blocks its variant until the lease runs
 * out and not a moment longer.
 */
async function tryAcquire(
  key: string,
  organizationId: string,
  holder: string,
  leaseMs: number
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ holder: string }[]>`
    INSERT INTO "StockLock" ("key", "organizationId", "holder", "expiresAt", "acquiredAt")
    VALUES (
      ${key},
      ${organizationId},
      ${holder},
      ${UTC_NOW} + make_interval(secs => ${leaseMs / 1000}::double precision),
      ${UTC_NOW}
    )
    ON CONFLICT ("key") DO UPDATE
      SET "holder" = EXCLUDED."holder",
          "expiresAt" = EXCLUDED."expiresAt",
          "acquiredAt" = EXCLUDED."acquiredAt"
      WHERE "StockLock"."expiresAt" < ${UTC_NOW}
    RETURNING "holder"
  `

  return rows[0]?.holder === holder
}

/**
 * Gives a lease back.
 *
 * Matched on holder as well as key so a checkout that overran its lease — and
 * whose variant a later checkout has since taken — cannot free a lock it no
 * longer owns. Never throws: the work it guarded is already done or already
 * failed, and an unreleased lease expires on its own.
 */
async function release(key: string, holder: string): Promise<void> {
  try {
    await prisma.stockLock.deleteMany({ where: { key, holder } })
  } catch (error) {
    console.error('[stock-queue] could not release lock', key, error)
  }
}

/**
 * Runs `work` with exclusive claim on every one of these variants.
 *
 * Keys are taken in sorted order. Two carts holding the same two products in
 * opposite orders would otherwise each take one and wait forever for the other;
 * a global order means one of them always gets both.
 *
 * On timeout everything already taken is released and the shopper is asked to
 * retry, which is the honest answer — the alternative is proceeding without the
 * claim, which is the bug this exists to fix.
 */
export async function withStockLock<T>(
  organizationId: string,
  variantIds: string[],
  work: () => Promise<T>,
  options: { leaseMs?: number; waitMs?: number } = {}
): Promise<T> {
  const keys = [...new Set(variantIds)]
    .map((variantId) => lockKey(organizationId, variantId))
    .sort()

  if (keys.length === 0) return work()

  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS
  const holder = randomUUID()
  const deadline = Date.now() + waitMs
  const held: string[] = []

  try {
    for (const key of keys) {
      let acquired = false

      while (true) {
        acquired = await tryAcquire(key, organizationId, holder, leaseMs)
        if (acquired) break
        if (Date.now() >= deadline) break
        // Jittered, so two checkouts that collide do not then collide again on
        // every retry in lockstep.
        await sleep(RETRY_MS + Math.floor(Math.random() * RETRY_MS))
      }

      if (!acquired) throw new StockQueueTimeoutError()
      held.push(key)
    }

    return await work()
  } finally {
    await Promise.all(held.map((key) => release(key, holder)))
  }
}

/**
 * Units this workspace has taken that the merchant's number does not show yet.
 *
 * Only `PENDING` holds count. A `CONFIRMED` one moved their figure when it was
 * made, so the live read already excludes it and subtracting it again would
 * understate the shelf by exactly the amount we are about to sell.
 *
 * `excludeOrderRef` keeps a checkout from competing with its own earlier
 * attempt: a retried submit re-reads stock while its first hold is still
 * outstanding, and counting that against itself would refuse a sale it has
 * already legitimately claimed the units for.
 */
export async function outstandingHolds(
  organizationId: string,
  variantIds: string[],
  options: { excludeOrderRef?: string } = {}
): Promise<Map<string, number>> {
  const held = new Map<string, number>()
  if (variantIds.length === 0) return held

  const rows = await prisma.remoteStockHold.findMany({
    where: {
      organizationId,
      variantId: { in: [...new Set(variantIds)] },
      state: 'PENDING',
      releasedAt: null,
      expiresAt: { gt: new Date() },
      ...(options.excludeOrderRef
        ? { orderRef: { not: options.excludeOrderRef } }
        : {}),
    },
    select: { variantId: true, quantity: true },
  })

  for (const row of rows) {
    held.set(row.variantId, (held.get(row.variantId) ?? 0) + row.quantity)
  }

  return held
}

/**
 * Writes down what was taken.
 *
 * Upserted on (organisation, order, variant) so a retried checkout replaces its
 * own hold rather than stacking a second one beside it — two rows for one cart
 * line would double the units this workspace believes it owes.
 */
export async function recordStockHolds(
  organizationId: string,
  orderRef: string,
  lines: (StockMovementLine & { productId?: string | null })[],
  state: 'PENDING' | 'CONFIRMED',
  ttlMs: number = HOLD_TTL_MS
): Promise<void> {
  if (lines.length === 0) return

  const expiresAt = new Date(Date.now() + ttlMs)

  await prisma.$transaction(
    lines.map((line) =>
      prisma.remoteStockHold.upsert({
        where: {
          organizationId_orderRef_variantId: {
            organizationId,
            orderRef,
            variantId: line.variantId,
          },
        },
        create: {
          organizationId,
          orderRef,
          variantId: line.variantId,
          productId: line.productId ?? null,
          quantity: line.quantity,
          state,
          expiresAt,
        },
        update: {
          quantity: line.quantity,
          productId: line.productId ?? null,
          state,
          expiresAt,
          releasedAt: null,
        },
      })
    )
  )
}

/**
 * Stops counting units this workspace no longer owes — a failed write, a
 * cancellation, a refund, a return.
 *
 * With `lines`, each named hold comes down by that quantity and is released
 * once nothing is left of it. That matters for a partial return: one shirt
 * coming back out of three does not mean the other two are suddenly reflected
 * in the merchant's figure, and releasing the whole hold would advertise them
 * twice. Without `lines`, every hold under the reference goes.
 *
 * Returns what it actually gave back, per variant, so a caller releasing across
 * several references can subtract as it goes rather than asking each of them
 * for the whole quantity — which would give back more than was ever held.
 *
 * Released rather than deleted, so support can still answer "what did we think
 * we were holding at 14:02" — the first question asked when a merchant's count
 * and ours disagree.
 *
 * Never throws. Whatever prompted this has already happened, and an unreleased
 * hold stops counting at its expiry regardless.
 */
export async function releaseStockHolds(
  organizationId: string,
  orderRef: string,
  lines?: StockMovementLine[]
): Promise<Map<string, number>> {
  const released = new Map<string, number>()

  try {
    if (!lines) {
      const rows = await prisma.remoteStockHold.findMany({
        where: { organizationId, orderRef, releasedAt: null },
        select: { variantId: true, quantity: true },
      })
      for (const row of rows) {
        released.set(
          row.variantId,
          (released.get(row.variantId) ?? 0) + row.quantity
        )
      }
      await prisma.remoteStockHold.updateMany({
        where: { organizationId, orderRef, releasedAt: null },
        data: { releasedAt: new Date() },
      })
      return released
    }

    if (lines.length === 0) return released

    const rows = await prisma.remoteStockHold.findMany({
      where: {
        organizationId,
        orderRef,
        releasedAt: null,
        variantId: { in: lines.map((line) => line.variantId) },
      },
      select: { id: true, variantId: true, quantity: true },
    })
    if (rows.length === 0) return released

    const returning = new Map<string, number>()
    for (const line of lines) {
      returning.set(
        line.variantId,
        (returning.get(line.variantId) ?? 0) + line.quantity
      )
    }

    const now = new Date()

    await prisma.$transaction(
      rows.map((row) => {
        // Never more than this hold actually holds. The caller may be handing
        // back units claimed under several references at once — an order edit
        // reserves under its own — and each of them can only give up what it
        // took.
        const taken = Math.min(returning.get(row.variantId) ?? 0, row.quantity)
        released.set(row.variantId, (released.get(row.variantId) ?? 0) + taken)

        const left = row.quantity - taken
        return prisma.remoteStockHold.update({
          where: { id: row.id },
          data:
            left > 0 ? { quantity: left } : { quantity: 0, releasedAt: now },
        })
      })
    )
  } catch (error) {
    console.error('[stock-queue] could not release holds', orderRef, error)
  }

  return released
}
