import 'server-only'
import { prisma } from '@/server/db/client'
import { decryptSecret } from '@/lib/crypto'
import { verifySignature } from '@/lib/signature'

/**
 * Changes reported back by the website that is processing an order.
 *
 * The return leg. A merchant whose staff cancel an order in their own admin —
 * or add a line to it, or mark it delivered — has changed a shared record, and
 * NCOM's copy has to follow or the two order books quietly stop describing the
 * same sale.
 *
 * ── Why this is not an API key ──────────────────────────────────────────────
 * `ORDERS_WRITE` exists in the scope enum and is deliberately never offered:
 * order mutations are recorded against the person who made them, and an API
 * key is not a person. That reasoning holds, and this is not an exception to
 * it. This is not somebody editing an order through an API — it is the system
 * that *owns* the order reporting what happened to it, and it may only touch
 * orders it was given. So it authenticates with the order-destination secret,
 * which is provisioned by the handoff setup, scoped to exactly this
 * integration, and revoked for both directions at once when rotated.
 *
 * ── What it may and may not do ──────────────────────────────────────────────
 * It may report changes to an order NCOM handed to *that* endpoint's
 * organisation. It cannot create orders, cannot reach another workspace's data,
 * and cannot move an order into a state NCOM would not otherwise reach. Every
 * check below is scoped by the organisation the key resolved to.
 *
 * ── Stock ───────────────────────────────────────────────────────────────────
 * Only NCOM's own units move here. The merchant's site owns its own stock and
 * has already moved it — that is what "they are processing the order" means —
 * and moving it again from this side is the double-decrement this whole design
 * exists to avoid. What NCOM adjusts is the stock of products NCOM stores,
 * which is the half the merchant's system cannot see.
 */

export type InboundResult =
  | { ok: true; revision: number; deduped?: boolean }
  | { ok: false; status: number; error: string; revision?: number }

interface InboundMessage {
  topic?: unknown
  idempotencyKey?: unknown
  baseRevision?: unknown
  revision?: unknown
  reason?: unknown
  order?: { id?: unknown; status?: unknown } | null
}

/**
 * Resolves the caller and proves it holds the secret.
 *
 * Returns the organisation the credential belongs to, or a refusal. The reason
 * is for our logs and never for the caller: telling an unauthenticated stranger
 * "stale timestamp" versus "signature mismatch" tells them which half of the
 * forgery to fix.
 */
export async function authenticateCallback(
  keyId: string | null,
  signature: string | null,
  rawBody: string
): Promise<{ organizationId: string } | null> {
  if (!keyId || !signature) return null

  const destination = await prisma.orderDestination.findFirst({
    where: { keyId, mode: 'OWN_WEBSITE' },
    select: { organizationId: true, secret: true },
  })
  if (!destination?.secret) return null

  let secret: string
  try {
    secret = decryptSecret(destination.secret)
  } catch {
    return null
  }

  if (!verifySignature(secret, signature, rawBody)) return null

  return { organizationId: destination.organizationId }
}

/**
 * Applies one change reported by the merchant's website.
 *
 * The revision check is the whole safety property. A message quoting a base
 * NCOM does not hold means somebody changed this order in both places, and
 * there is no correct automatic answer — so it is refused with 409 and NCOM's
 * own revision, and the order is flagged. Merging would silently discard one
 * of two real people's work.
 */
export async function applyInboundChange(
  organizationId: string,
  message: InboundMessage
): Promise<InboundResult> {
  const topic = String(message.topic ?? '')
  const orderId = String(message.order?.id ?? '')
  if (!orderId) {
    return { ok: false, status: 400, error: 'Missing order id' }
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      syncRevision: true,
      cancelledAt: true,
      stockConsumedAt: true,
      forward: {
        select: { id: true, conflictAt: true, lastInboundKey: true },
      },
    },
  })
  // Scoped by organisation, so a credential for one workspace cannot name
  // another's order — it simply does not exist from here.
  if (!order) return { ok: false, status: 404, error: 'Unknown order' }

  // An order NCOM never handed over is not theirs to change.
  if (!order.forward) {
    return {
      ok: false,
      status: 409,
      error: 'This order is processed in NCOM, not on your website',
      revision: order.syncRevision,
    }
  }

  const base = Number(message.baseRevision)
  if (!Number.isInteger(base)) {
    return { ok: false, status: 400, error: 'Missing baseRevision' }
  }

  const key = String(message.idempotencyKey ?? '')

  // Their retry of the change we most recently accepted from them. Recognised
  // by the key rather than by the revision, and the difference is the whole
  // point: a retry and a stale change both quote a base lower than we hold, and
  // guessing between them by comparing numbers loses somebody's edit. See the
  // note on `lastInboundKey`.
  if (key && key === order.forward.lastInboundKey) {
    return { ok: true, revision: order.syncRevision, deduped: true }
  }

  // Anything else that does not build on exactly what we hold is a divergence,
  // in either direction. Ahead of us means we missed a message and applying
  // this one would skip what was in between; behind us means they built on a
  // version we have already moved past. Neither has a correct automatic answer.
  if (base !== order.syncRevision) {
    await flagConflict(
      order.forward.id,
      `Your website built this change on version ${base} of the order and NCOM is on version ${order.syncRevision}. Somebody changed it in both places, or a change went missing between the two.`
    )
    return {
      ok: false,
      status: 409,
      error: 'NCOM holds a different version of this order',
      revision: order.syncRevision,
    }
  }

  switch (topic) {
    case 'order.cancelled':
      return cancelFromMerchant(
        organizationId,
        order,
        typeof message.reason === 'string' ? message.reason : null,
        key
      )
    case 'order.updated':
      return acknowledgeUpdate(order, key)
    default:
      return { ok: false, status: 400, error: `Unknown topic "${topic}"` }
  }
}

type OrderRow = {
  id: string
  syncRevision: number
  cancelledAt: Date | null
  stockConsumedAt: Date | null
  forward: {
    id: string
    conflictAt: Date | null
    lastInboundKey: string | null
  } | null
}

/**
 * The merchant cancelled it on their side.
 *
 * NCOM's copy follows and NCOM's own units go back on the shelf. Idempotent:
 * an order already cancelled here answers with the revision it holds rather
 * than cancelling twice, because their retry and their second cancellation are
 * indistinguishable on the wire.
 */
async function cancelFromMerchant(
  organizationId: string,
  order: OrderRow,
  reason: string | null,
  key: string
): Promise<InboundResult> {
  if (order.cancelledAt) {
    return { ok: true, revision: order.syncRevision, deduped: true }
  }

  // Only NCOM's own products. Their units are theirs and they have already
  // handed them back — see the stock note at the top of this file.
  //
  // Before the transaction and outside it, matching cancelOrder: a
  // cancellation that saves after the stock went back is the safe order of the
  // two, because the alternative leaves units held for an order nobody sees.
  if (!order.stockConsumedAt) {
    const gives = await ncomOwnedUnits(order.id)

    if (gives.length > 0) {
      // Imported lazily. `inventoryService` reaches the session stack through
      // `rbac`, which drags the framework's client runtime in with it — fine
      // inside the app, fatal in the plain-node process where
      // `pnpm check:order-handoff` proves this path. Nothing about the runtime
      // behaviour changes: the import resolves from cache after the first call.
      const { returnToStock } =
        await import('@/server/services/inventoryService')
      await returnToStock(organizationId, order.id, gives, {
        orderId: order.id,
      })
    }
  }

  const now = new Date()
  const revision = order.syncRevision + 1

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        cancelledAt: now,
        cancelReason: 'OTHER',
        workflowState: 'CANCELLED',
        workflowUpdatedAt: now,
        syncRevision: revision,
      },
    })
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'order_cancelled',
        message: reason
          ? `Cancelled on your website: ${reason}`
          : 'Cancelled on your website',
      },
    })
    // Both sides now agree, and this change came *from* them — so nothing is
    // queued back. That is what stops an echo loop: a change applied because of
    // a sync message never produces a sync message of its own.
    await tx.orderForward.updateMany({
      where: { orderId: order.id },
      data: { syncedRevision: revision, lastInboundKey: key || null },
    })
  })

  return { ok: true, revision }
}

/**
 * The merchant changed the order on their side.
 *
 * Recorded on the timeline and the revision advanced, so both sides stay in
 * step and the next message from either is judged against the right base.
 *
 * The lines themselves are deliberately **not** rewritten from their payload
 * yet. Doing that safely means re-pricing an edited basket against NCOM's own
 * offer, tax and discount rules — which is `editOrder`'s whole job and is not
 * something to half-do from a webhook. Until that is wired, an edit on their
 * side is recorded here rather than silently applied wrong, and the merchant's
 * own system stays the authority for what is in the parcel. `payload` on the
 * handoff row keeps the detail either way.
 */
async function acknowledgeUpdate(
  order: OrderRow,
  key: string
): Promise<InboundResult> {
  const revision = order.syncRevision + 1

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { syncRevision: revision },
    })
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'order_edited',
        message: 'Changed on your website',
      },
    })
    await tx.orderForward.updateMany({
      where: { orderId: order.id },
      data: { syncedRevision: revision, lastInboundKey: key || null },
    })
  })

  return { ok: true, revision }
}

/**
 * The units on an order that are NCOM's to move.
 *
 * The lines whose variant exists in NCOM's own tables. Everything else came
 * from the merchant's catalogue, and those units are theirs — already moved by
 * their own system, and moving them again from here is the double-decrement
 * this whole design exists to avoid.
 *
 * Exported because it is the part of the cancellation that is actually new, and
 * the part worth proving: `returnToStock` below it is the same call the ordinary
 * cancel path has always made.
 */
export async function ncomOwnedUnits(
  orderId: string
): Promise<{ variantId: string; quantity: number }[]> {
  const lines = await prisma.orderLine.findMany({
    where: { orderId, variantId: { not: null } },
    select: { variantId: true, quantity: true },
  })
  if (lines.length === 0) return []

  const ours = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((line) => line.variantId!) } },
    select: { id: true },
  })
  const ourIds = new Set(ours.map((variant) => variant.id))

  return lines
    .filter((line) => ourIds.has(line.variantId!))
    .map((line) => ({ variantId: line.variantId!, quantity: line.quantity }))
}

async function flagConflict(forwardId: string, reason: string): Promise<void> {
  await prisma.orderForward
    .update({
      where: { id: forwardId },
      data: { conflictAt: new Date(), conflictReason: reason },
    })
    .catch(() => {
      // A flag that cannot be written must not turn a refusal into a 500. The
      // caller is still told 409, which is the part that protects the data.
    })
}
