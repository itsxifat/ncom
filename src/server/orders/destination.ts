import 'server-only'
import { prisma } from '@/server/db/client'
import { decryptSecret } from '@/lib/crypto'

/**
 * Where a workspace's orders are processed, and the credentials to get them
 * there.
 *
 * This module is the runtime half, and it authorises nothing: it is called from
 * checkout, where a shopper pressing "Place order" must not load the session
 * stack to find out where the order goes. Everything a human presses lives in
 * `admin.ts`, which does authorise — the same split, for the same reason, that
 * `catalog/connection.ts` and `catalog/connection-admin.ts` already make.
 */

/** What the checkout path needs to know. Never leaves the server. */
export interface OrderTarget {
  organizationId: string
  endpointUrl: string
  keyId: string
  secret: string
  timeoutMs: number
  handoffInline: boolean
  /**
   * Whether NCOM still reports the Purchase for orders sent here.
   *
   * False when the merchant's website reports it instead — the usual case, and
   * what stops the same sale being counted twice by a pixel both sides share.
   * Resolved here rather than at the point of use so that the one question
   * checkout already asks about a workspace answers this one too: a decision
   * about a handed-over order should not cost a second query about whether the
   * order was handed over.
   *
   * Says nothing about PageView or ViewContent. Those are reported by NCOM for
   * every landing page it serves, because it is the only side that served it.
   */
  ncomReportsPurchase: boolean
}

/**
 * The website this workspace's orders go to, or null if NCOM processes them.
 *
 * Null covers three cases that are all the same decision from checkout's point
 * of view: no row at all (the overwhelming majority — nobody has opened the
 * screen), a row still set to NCOM, and a row set to OWN_WEBSITE that is not
 * finished being configured.
 *
 * That last one is worth being explicit about. A half-configured destination
 * must fall back to processing the order here rather than refusing it: the
 * order is already placed and paid for in promise, and losing it because a URL
 * field is empty would be the most expensive possible way to report a
 * configuration mistake. The dashboard refuses to *switch* to OWN_WEBSITE
 * without a working endpoint, which is where that error belongs.
 */
export async function loadOrderTarget(
  organizationId: string
): Promise<OrderTarget | null> {
  const row = await prisma.orderDestination.findUnique({
    where: { organizationId },
    select: {
      mode: true,
      endpointUrl: true,
      keyId: true,
      secret: true,
      timeoutMs: true,
      handoffInline: true,
      purchaseReporting: true,
    },
  })

  if (!row || row.mode !== 'OWN_WEBSITE') return null
  if (!row.endpointUrl || !row.keyId || !row.secret) return null

  let secret: string
  try {
    secret = decryptSecret(row.secret)
  } catch (cause) {
    // An unreadable secret is a configuration fault, not a reason to refuse a
    // sale — the order is processed here and the merchant is told on the
    // settings screen, which is the only place they can fix it.
    console.error('[orders] cannot decrypt destination secret', cause)
    return null
  }

  return {
    organizationId,
    endpointUrl: row.endpointUrl,
    keyId: row.keyId,
    secret,
    timeoutMs: row.timeoutMs,
    handoffInline: row.handoffInline,
    ncomReportsPurchase: row.purchaseReporting === 'NCOM',
  }
}

/** Records what a test or a live attempt found, for the health panel. */
export async function recordDestinationHealth(
  organizationId: string,
  result: { ok: boolean; error?: string | null }
): Promise<void> {
  await prisma.orderDestination
    .update({
      where: { organizationId },
      data: {
        lastCheckedAt: new Date(),
        ...(result.ok
          ? { lastOkAt: new Date(), lastError: null }
          : {
              lastError: result.error ?? 'The website did not accept the order',
            }),
      },
    })
    .catch(() => {
      // Health is a nicety. A workspace whose row was deleted mid-flight must
      // not turn that into a failed handoff.
    })
}

/**
 * Whether this order was handed to a merchant's website.
 *
 * Asked of the handoff row rather than of the workspace's current mode, and the
 * difference matters: a workspace that switches back to processing orders in
 * NCOM still has orders out there that somebody else's system is holding stock
 * for. Those orders keep behaving as forwarded ones for the rest of their
 * lives, because that is what they are.
 */
export async function isForwardedOrder(
  organizationId: string,
  orderId: string
): Promise<boolean> {
  const forward = await prisma.orderForward.findFirst({
    where: { orderId, organizationId },
    select: { id: true },
  })
  return forward !== null
}
