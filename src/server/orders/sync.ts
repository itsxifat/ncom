import 'server-only'
import { prisma } from '@/server/db/client'
import { Prisma } from '@/generated/prisma/client'
import { buildHandoffEnvelope } from './payload'
import { loadOrderTarget, recordDestinationHealth } from './destination'
import { deliver } from './transport'
import { schedule } from './forward'
import type { HandoffEnvelope } from './types'

/**
 * Keeping a handed-over order in step with the merchant's website.
 *
 * The handoff in forward.ts gives an order away once. This is everything that
 * happens to it afterwards — an edit, a cancellation — pushed to the site that
 * is now processing it, and it exists because the alternative is two order
 * books that agree only on the day the order was placed.
 *
 * ── Why the whole order, not a diff ─────────────────────────────────────────
 * Every message carries the complete order. A diff is smaller and is the wrong
 * shape for this: applied against a base the sender did not have, it silently
 * produces a third state neither side chose. The whole order applied against a
 * *checked* base can only produce what the sender saw.
 *
 * ── Why messages are ordered, and one failure blocks the rest ───────────────
 * Two edits to one order are not independent facts. "Quantity is now 3"
 * delivered after "quantity is now 5" leaves the merchant holding a number
 * nobody chose, and a queue that retries in parallel will do exactly that
 * eventually. So messages for a single order are sent oldest-first and a
 * message that has not landed holds the ones behind it. Different orders never
 * wait on each other.
 *
 * The revision check on the receiving side makes this safe rather than merely
 * likely: even if ordering were somehow violated, a message whose base does
 * not match is refused rather than applied.
 *
 * ── Why a conflict stops the order rather than resolving it ─────────────────
 * A 409 means the merchant's site holds a version NCOM did not produce —
 * somebody edited the order in both places. There is no correct automatic
 * answer to that. Picking one silently discards a real person's work, so the
 * order is flagged and further syncing for it stops until a human looks. One
 * divergence a human can see beats two systems confidently disagreeing.
 */

/** Attempts per message, including the first. */
const MAX_ATTEMPTS = 8

/** Backoff in seconds: 15s, 1m, 5m, 15m, 1h, 3h, 6h — the handoff schedule. */
const RETRY_BACKOFF_SECONDS = [15, 60, 300, 900, 3600, 10_800, 21_600]

/** Orders touched per sweep, so one workspace's backlog cannot starve the rest. */
const SWEEP_BATCH = 50

export type SyncKind = 'ORDER_UPDATED' | 'ORDER_CANCELLED'

/**
 * Queues a change for the merchant's website, and tries it immediately.
 *
 * Called from the mutation that made the change, after its transaction has
 * committed — a message describing a state the database does not hold is worse
 * than a late one. Never throws: the change has happened here and turning a
 * delivery problem into a failed edit would be strictly worse than a late
 * notification the merchant can see is late.
 *
 * Does nothing for an order that was never handed over, which is every order
 * in a workspace NCOM processes itself.
 */
export async function syncOrderChange(
  organizationId: string,
  orderId: string,
  kind: SyncKind,
  options: {
    reason?: string | null
    /**
     * The revision to claim this change was built from, overriding the natural
     * one. Only the conflict-resolution path passes it: a human who has
     * compared both copies and chosen NCOM's is saying "I have seen your
     * version N and I am replacing it", and quoting N expresses that decision
     * in the ordinary contract rather than as a force flag their receiver
     * would need a special case for.
     */
    baseRevision?: number
    /** Queue even though the order is flagged — the resolution path does. */
    pastConflict?: boolean
  } = {}
): Promise<void> {
  try {
    const forward = await prisma.orderForward.findFirst({
      where: { orderId, organizationId },
      select: { id: true, conflictAt: true },
    })
    // No handoff row means this order lives here and nowhere else.
    if (!forward) return

    // Already diverged. Piling more messages onto a known conflict is how one
    // wrong number becomes several; the merchant resolves it and resends.
    if (forward.conflictAt && !options.pastConflict) return

    const target = await loadOrderTarget(organizationId)
    if (!target) return

    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      select: { syncRevision: true },
    })
    if (!order) return

    const envelope = await buildHandoffEnvelope(organizationId, orderId)
    if (!envelope) return

    const revision = order.syncRevision
    const message = {
      ...envelope,
      topic:
        kind === 'ORDER_CANCELLED'
          ? ('order.cancelled' as const)
          : ('order.updated' as const),
      // Not the order id: that is the placement key, and reusing it would make
      // every change look like a repeat of the original handoff. One key per
      // revision, which is exactly the granularity a receiver deduplicates at.
      idempotencyKey: `${orderId}:${revision}`,
      baseRevision: options.baseRevision ?? revision - 1,
      revision,
      reason: options.reason ?? null,
    } satisfies HandoffEnvelope

    const queued = await queue(organizationId, orderId, kind, message)
    if (!queued) return

    await schedule(() => drainOrder(orderId))
  } catch (cause) {
    console.error('[orders] could not queue change', orderId, cause)
  }
}

/**
 * Writes the queue row, or returns null if this revision is already queued.
 *
 * The unique index on `idempotencyKey` is what makes that reliable: two servers
 * racing on the same edit both try to insert and exactly one wins, without
 * either holding a lock.
 */
async function queue(
  organizationId: string,
  orderId: string,
  kind: SyncKind,
  message: HandoffEnvelope
): Promise<{ id: string } | null> {
  try {
    return await prisma.orderSyncMessage.create({
      data: {
        organizationId,
        orderId,
        kind,
        idempotencyKey: message.idempotencyKey,
        baseRevision: message.baseRevision ?? 0,
        revision: message.revision ?? 0,
        payload: message as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    })
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === 'P2002'
    ) {
      return null
    }
    throw cause
  }
}

/**
 * Sends one order's queued changes, oldest first, stopping at the first that
 * does not land.
 *
 * Stopping is the point — see the ordering note at the top of the file.
 */
export async function drainOrder(orderId: string): Promise<void> {
  const pending = await prisma.orderSyncMessage.findMany({
    where: { orderId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  for (const message of pending) {
    const landed = await attemptSync(message.id)
    if (!landed) return
  }
}

/**
 * One attempt at one message. Returns whether the queue may move on.
 *
 * Safe to call concurrently with itself: the worst case is the same message
 * twice, which the idempotency key exists to make harmless.
 */
export async function attemptSync(messageId: string): Promise<boolean> {
  const message = await prisma.orderSyncMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      organizationId: true,
      orderId: true,
      status: true,
      attempts: true,
      revision: true,
      idempotencyKey: true,
      payload: true,
    },
  })
  if (!message) return true
  if (message.status !== 'PENDING') return message.status === 'DELIVERED'

  // Read live rather than from the row: a merchant who fixed a wrong URL or
  // rotated a secret expects the queue to use what they just saved.
  const target = await loadOrderTarget(message.organizationId)
  if (!target) {
    await prisma.orderSyncMessage.update({
      where: { id: message.id },
      data: {
        status: 'FAILED',
        nextAttemptAt: null,
        error:
          'Orders are no longer sent to a website, so this change was never delivered.',
      },
    })
    return false
  }

  const attempt = message.attempts + 1
  const body = JSON.stringify(message.payload)
  const result = await deliver(target, message.idempotencyKey, body)

  if (result.ok) {
    await prisma.$transaction([
      prisma.orderSyncMessage.update({
        where: { id: message.id },
        data: {
          status: 'DELIVERED',
          attempts: attempt,
          nextAttemptAt: null,
          deliveredAt: new Date(),
          statusCode: result.statusCode,
          error: null,
          responseBody: result.snippet,
        },
      }),
      // Both sides now agree on this revision. Recorded so the reconciliation
      // sweep can tell "not sent yet" from "sent and agreed".
      prisma.orderForward.updateMany({
        where: { orderId: message.orderId },
        data: { syncedRevision: message.revision },
      }),
    ])
    await recordDestinationHealth(message.organizationId, { ok: true })
    return true
  }

  // The two sides hold different versions. No automatic answer is correct, so
  // the order is flagged and syncing for it stops — see the note at the top.
  if (result.conflict) {
    const theirs = result.ack?.revision
    await prisma.$transaction([
      prisma.orderSyncMessage.update({
        where: { id: message.id },
        data: {
          status: 'REFUSED',
          attempts: attempt,
          nextAttemptAt: null,
          statusCode: result.statusCode,
          error: result.error,
          responseBody: result.snippet,
        },
      }),
      prisma.orderForward.updateMany({
        where: { orderId: message.orderId },
        data: {
          conflictAt: new Date(),
          // Remembered so resolving the conflict is expressible in the ordinary
          // contract rather than as a "force" flag — see the note on the column.
          remoteRevision: theirs ?? null,
          conflictReason:
            theirs === undefined
              ? 'Your website holds a different version of this order. Compare the two before sending it again.'
              : `Your website is on version ${theirs} of this order and NCOM is on version ${message.revision}. Somebody changed it in both places.`,
        },
      }),
    ])
    return false
  }

  const terminal = result.terminal || attempt >= MAX_ATTEMPTS
  const backoff =
    RETRY_BACKOFF_SECONDS[
      Math.min(attempt - 1, RETRY_BACKOFF_SECONDS.length - 1)
    ]

  await prisma.orderSyncMessage.update({
    where: { id: message.id },
    data: {
      status: terminal ? (result.terminal ? 'REFUSED' : 'FAILED') : 'PENDING',
      attempts: attempt,
      nextAttemptAt: terminal ? null : new Date(Date.now() + backoff * 1000),
      statusCode: result.statusCode,
      error: result.error,
      responseBody: result.snippet,
    },
  })
  await recordDestinationHealth(message.organizationId, {
    ok: false,
    error: result.error,
  })
  return false
}

/**
 * Retries every order with a change whose backoff has elapsed.
 *
 * Grouped by order rather than by message, because the queue is per-order: a
 * sweep that picked due messages individually would send an order's second
 * change while its first was still waiting.
 */
export async function retryPendingSyncs(): Promise<number> {
  const due = await prisma.orderSyncMessage.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: SWEEP_BATCH,
    select: { orderId: true },
    distinct: ['orderId'],
  })

  for (const row of due) {
    await drainOrder(row.orderId)
  }

  return due.length
}

/**
 * Sends NCOM's version of a conflicted order, deliberately replacing theirs.
 *
 * The way out of a conflict, and the only place in this design where one side's
 * copy overwrites the other's. That is safe here and nowhere else, because a
 * person has read what each side says and decided — the machinery's refusal to
 * choose is what got the decision in front of them.
 *
 * Expressed in the ordinary contract rather than as a force flag: the message
 * quotes *their* revision as its base, which says "I have seen your version and
 * I am replacing it". Their own revision check then accepts it for the normal
 * reason, with no special case on either side to get wrong.
 */
export async function resolveConflict(
  organizationId: string,
  orderId: string
): Promise<void> {
  const forward = await prisma.orderForward.findFirst({
    where: { orderId, organizationId },
    select: { id: true, conflictAt: true, remoteRevision: true },
  })
  if (!forward?.conflictAt) return

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: { syncRevision: true, cancelledAt: true },
  })
  if (!order) return

  const envelope = await buildHandoffEnvelope(organizationId, orderId)
  if (!envelope) return

  // A revision they have not seen, so a later message from them is judged
  // against this override rather than against the version it replaced.
  const revision = order.syncRevision + 1

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { syncRevision: revision },
    }),
    prisma.orderForward.update({
      where: { id: forward.id },
      data: { conflictAt: null, conflictReason: null, remoteRevision: null },
    }),
    // Whatever was queued behind the conflict described a state that has since
    // been superseded by this override. Sending it afterwards would undo the
    // decision the human just made.
    prisma.orderSyncMessage.updateMany({
      where: { orderId, status: 'PENDING' },
      data: {
        status: 'FAILED',
        nextAttemptAt: null,
        error: 'Superseded by a conflict resolved by hand.',
      },
    }),
  ])

  const kind: SyncKind = order.cancelledAt ? 'ORDER_CANCELLED' : 'ORDER_UPDATED'

  const message = {
    ...envelope,
    topic:
      kind === 'ORDER_CANCELLED'
        ? ('order.cancelled' as const)
        : ('order.updated' as const),
    idempotencyKey: `${orderId}:${revision}`,
    baseRevision: forward.remoteRevision ?? revision - 1,
    revision,
    reason: null,
  } satisfies HandoffEnvelope

  const queued = await queue(organizationId, orderId, kind, message)
  if (!queued) return

  await schedule(() => drainOrder(orderId))
}
