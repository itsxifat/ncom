import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto'
import { assertPublicHttpsUrl } from '@/lib/outbound-url'
import { attemptForward, schedule } from './forward'
import type { OrderForwardStatus, OrderRouting } from '@/generated/prisma/enums'

/**
 * Everything a human presses on the order-handling screens.
 *
 * The dashboard half of `destination.ts`, split off for the reason the module
 * doc there gives: every function here authorises first, and a checkout must
 * never load the session stack to find out where an order goes.
 *
 * Reading the queue is here too. That the handoff is a table rather than an
 * in-memory job is the whole point — a merchant whose website was down for an
 * hour has to be able to see which orders never arrived, and to be told before
 * a customer tells them.
 */

// ── Where orders go ──────────────────────────────────────────────────────
export interface OrderDestinationStatus {
  mode: OrderRouting
  endpointUrl: string | null
  keyId: string | null
  /** Enough to tell two secrets apart in a support thread, never enough to sign. */
  secretHint: string | null
  timeoutMs: number
  handoffInline: boolean
  lastCheckedAt: Date | null
  lastOkAt: Date | null
  lastError: string | null
}

const DEFAULT_STATUS: OrderDestinationStatus = {
  mode: 'NCOM',
  endpointUrl: null,
  keyId: null,
  secretHint: null,
  timeoutMs: 15_000,
  handoffInline: true,
  lastCheckedAt: null,
  lastOkAt: null,
  lastError: null,
}

/**
 * Never null: a workspace that has never opened this screen is not in an
 * unknown state, it is in the default one. Returning the defaults rather than
 * null keeps the page from having to render two versions of itself.
 */
export async function getOrderDestinationStatus(
  organizationId: string
): Promise<OrderDestinationStatus> {
  await requireOrgAccess(organizationId)

  const row = await prisma.orderDestination.findUnique({
    where: { organizationId },
  })
  if (!row) return DEFAULT_STATUS

  return {
    mode: row.mode,
    endpointUrl: row.endpointUrl,
    keyId: row.keyId,
    secretHint: row.secret ? safeHint(row.secret) : null,
    timeoutMs: row.timeoutMs,
    handoffInline: row.handoffInline,
    lastCheckedAt: row.lastCheckedAt,
    lastOkAt: row.lastOkAt,
    lastError: row.lastError,
  }
}

export interface SaveDestinationInput {
  endpointUrl: string
  timeoutMs?: number
  handoffInline?: boolean
}

export interface SavedDestination {
  keyId: string
  /** Present only when one was just minted. Shown once and never again. */
  secret: string | null
}

/**
 * Saves the endpoint, minting credentials the first time.
 *
 * Saving does not switch the mode. A merchant pastes a URL, presses Test, sees
 * their own system answer, and only then moves the switch — because the moment
 * the switch moves, every order this workspace takes belongs to somebody else's
 * database, and that is not a thing to do as a side effect of typing a URL.
 */
export async function saveOrderDestination(
  organizationId: string,
  input: SaveDestinationInput
): Promise<SavedDestination> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const endpointUrl = assertPublicHttpsUrl(
    input.endpointUrl,
    'The order endpoint'
  )
  const timeoutMs = clampTimeout(input.timeoutMs)

  const existing = await prisma.orderDestination.findUnique({
    where: { organizationId },
    select: { keyId: true, secret: true },
  })

  // Credentials are minted once and survive a URL change. A merchant moving
  // their endpoint from a staging host to production must not have to
  // re-deploy their verifier with a new secret to do it.
  //
  // The pair is minted together, so a row missing either one gets both. Keeping
  // a key id whose secret is gone would leave the receiver verifying against a
  // secret nobody holds.
  const complete = Boolean(existing?.keyId && existing.secret)
  const keyId = complete
    ? existing!.keyId!
    : `ncomord_${randomBytes(6).toString('hex')}`
  const plainSecret = complete
    ? null
    : `ncomsec_${randomBytes(24).toString('base64url')}`

  const credentials =
    plainSecret === null ? {} : { keyId, secret: encryptSecret(plainSecret) }

  await prisma.orderDestination.upsert({
    where: { organizationId },
    create: {
      organizationId,
      endpointUrl,
      timeoutMs,
      handoffInline: input.handoffInline ?? true,
      ...credentials,
    },
    update: {
      endpointUrl,
      timeoutMs,
      ...(input.handoffInline === undefined
        ? {}
        : { handoffInline: input.handoffInline }),
      ...credentials,
      // A moved endpoint has to prove itself again before the panel calls it
      // healthy.
      lastOkAt: null,
      lastError: null,
      lastCheckedAt: null,
    },
  })

  return { keyId, secret: plainSecret }
}

/**
 * Moves the switch.
 *
 * Refuses to select OWN_WEBSITE without an endpoint that has answered at least
 * once. This is the one guard in the module that stops a sale, and it stops it
 * at the only safe moment — a merchant pressing a button in the dashboard,
 * rather than a stranger pressing "Place order" on a landing page at midnight.
 */
export async function setOrderRouting(
  organizationId: string,
  mode: OrderRouting
): Promise<void> {
  await requireOrgAccess(organizationId, 'ADMIN')

  if (mode === 'OWN_WEBSITE') {
    const row = await prisma.orderDestination.findUnique({
      where: { organizationId },
      select: { endpointUrl: true, secret: true, lastOkAt: true },
    })
    if (!row?.endpointUrl || !row.secret) {
      throw new Error(
        'Add the address of your order endpoint before sending orders to it'
      )
    }
    if (!row.lastOkAt) {
      throw new Error(
        'Press Test first. Orders will not be switched to an endpoint that has never answered.'
      )
    }
  }

  await prisma.orderDestination.update({
    where: { organizationId },
    data: { mode },
  })
}

export async function rotateOrderDestinationSecret(
  organizationId: string
): Promise<SavedDestination> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const secret = `ncomsec_${randomBytes(24).toString('base64url')}`
  const keyId = `ncomord_${randomBytes(6).toString('hex')}`

  // The key id rotates with the secret so a receiver can hold both briefly and
  // tell them apart by `X-NCOM-Key` — the same arrangement the catalogue
  // connection uses, so a merchant learns the pattern once.
  await prisma.orderDestination.update({
    where: { organizationId },
    data: { secret: encryptSecret(secret), keyId },
  })

  return { keyId, secret }
}

function clampTimeout(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 15_000
  // Nobody's page render waits on this, but a receiver that takes longer than
  // half a minute to write one order is one that should be answering fast and
  // working slowly.
  return Math.min(30_000, Math.max(2_000, Math.round(value)))
}

function safeHint(secret: string): string | null {
  try {
    return maskSecret(decryptSecret(secret))
  } catch {
    return null
  }
}

// ── The queue ────────────────────────────────────────────────────────────

export interface ForwardSummary {
  /** Queued, still being retried. Usually zero, and briefly non-zero. */
  pending: number
  /** Their site refused, or the queue gave up. These need a human. */
  stuck: number
}

export async function getForwardSummary(
  organizationId: string
): Promise<ForwardSummary> {
  await requireOrgAccess(organizationId)

  const counts = await prisma.orderForward.groupBy({
    by: ['status'],
    where: { organizationId, status: { not: 'DELIVERED' } },
    _count: { _all: true },
  })

  let pending = 0
  let stuck = 0
  for (const row of counts) {
    if (row.status === 'PENDING') pending += row._count._all
    else stuck += row._count._all
  }

  return { pending, stuck }
}

export interface OrderForwardView {
  status: OrderForwardStatus
  endpointUrl: string
  attempts: number
  nextAttemptAt: Date | null
  deliveredAt: Date | null
  remoteOrderNumber: string | null
  remoteOrderId: string | null
  statusCode: number | null
  error: string | null
  createdAt: Date
}

/** One order's handoff, for the order detail screen. Null if it has none. */
export async function getOrderForward(
  organizationId: string,
  orderId: string
): Promise<OrderForwardView | null> {
  await requireOrgAccess(organizationId)

  const row = await prisma.orderForward.findFirst({
    where: { orderId, organizationId },
    select: {
      status: true,
      endpointUrl: true,
      attempts: true,
      nextAttemptAt: true,
      deliveredAt: true,
      remoteOrderNumber: true,
      remoteOrderId: true,
      statusCode: true,
      error: true,
      createdAt: true,
    },
  })

  return row
}

/**
 * Sends an order again by hand.
 *
 * For the two states a human has to resolve: a receiver that refused, and one
 * that never answered. Resets the schedule rather than the attempt count, so
 * the audit trail still shows how hard the queue tried on its own.
 */
export async function resendForward(
  organizationId: string,
  orderId: string
): Promise<void> {
  // Authorised here as well as at the action that calls it. Re-sending an order
  // makes an outbound request that can create a record on somebody else's
  // system, which is an EDITOR's act — the same line drawn for cancelling one.
  await requireOrgAccess(organizationId, 'EDITOR')

  const forward = await prisma.orderForward.findFirst({
    where: { orderId, organizationId },
    select: { id: true, status: true },
  })
  if (!forward) throw new Error('This order was never queued for your website')
  if (forward.status === 'DELIVERED') return

  await prisma.orderForward.update({
    where: { id: forward.id },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
  })

  await schedule(() => attemptForward(forward.id))
}
