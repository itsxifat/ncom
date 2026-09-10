import type { OrderForwardStatus } from '@/generated/prisma/enums'

/**
 * Where an order is being processed, as one word.
 *
 * The order book answers "who is packing this?" from two columns that live on
 * different tables — whether an `OrderForward` row exists at all, and what
 * happened to it — and every screen that asked was re-deriving the answer
 * slightly differently. This is that derivation, once, in a module both the
 * server filter and the client badge can import.
 *
 * Deliberately not the raw `OrderForwardStatus`. That enum describes a delivery
 * attempt; this describes an order, and the two differ in the case that matters
 * most: an order with no forward row at all is not a failed handoff, it is an
 * order NCOM is processing, and it is the overwhelming majority.
 */
export const HANDOFF_STATES = [
  'NCOM',
  'SENT',
  'QUEUED',
  'STUCK',
  'CONFLICT',
] as const

export type HandoffState = (typeof HANDOFF_STATES)[number]

/**
 * What each state means to the person reading the list.
 *
 * `STUCK` covers both REFUSED and FAILED on purpose. The difference — their
 * site said no, versus their site never answered — matters when you are fixing
 * it, and the order's own screen says which. On a list of a hundred rows the
 * only question is whether this order arrived, and both answers are "no".
 */
export const HANDOFF_LABEL: Record<HandoffState, string> = {
  NCOM: 'Processed here',
  SENT: 'On your website',
  QUEUED: 'Waiting to send',
  STUCK: 'Never arrived',
  CONFLICT: 'Two versions',
}

/** The short form, for a badge sitting beside an order number. */
export const HANDOFF_BADGE_LABEL: Record<HandoffState, string> = {
  NCOM: 'Here',
  SENT: 'Sent',
  QUEUED: 'Sending',
  STUCK: 'Not sent',
  CONFLICT: 'Conflict',
}

/**
 * How loudly each state should read.
 *
 * Only the two that cost money are allowed to shout. A delivered handoff is the
 * normal case and gets the quietest treatment there is — a hundred green ticks
 * down a list train people to stop seeing the one red cross among them.
 */
export const HANDOFF_TONE: Record<
  HandoffState,
  'neutral' | 'muted' | 'warning' | 'danger'
> = {
  NCOM: 'muted',
  SENT: 'muted',
  QUEUED: 'neutral',
  STUCK: 'danger',
  CONFLICT: 'danger',
}

/** The forward columns this derivation needs. */
export interface HandoffFacts {
  status: OrderForwardStatus
  conflictAt: Date | string | null
}

/**
 * The one place the answer is decided.
 *
 * A conflict outranks the delivery status because a conflicted handoff is
 * always DELIVERED — the order arrived, and then the two copies drifted. Ranking
 * the other way round would file every disagreement under "on your website",
 * which is true and useless.
 */
export function handoffState(forward: HandoffFacts | null): HandoffState {
  if (!forward) return 'NCOM'
  if (forward.conflictAt) return 'CONFLICT'
  switch (forward.status) {
    case 'DELIVERED':
      return 'SENT'
    case 'PENDING':
      return 'QUEUED'
    default:
      return 'STUCK'
  }
}
