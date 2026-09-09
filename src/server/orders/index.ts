import 'server-only'

/**
 * Handing orders to a merchant's own website.
 *
 * The sibling of `server/catalog`, in the other direction: that module reads a
 * merchant's products out of their system, this one writes their orders back
 * into it. A workspace that connected its website usually wants both, and the
 * two are deliberately separate rows and separate secrets — see the note on
 * `OrderDestination` in schema.prisma.
 *
 * Everything a caller outside this directory should touch is re-exported here.
 */

export { loadOrderTarget, type OrderTarget } from './destination'

export {
  forwardOrder,
  retryPendingForwards,
  testOrderDestination,
} from './forward'

export {
  getOrderDestinationStatus,
  saveOrderDestination,
  setOrderRouting,
  rotateOrderDestinationSecret,
  getForwardSummary,
  getOrderForward,
  resendForward,
  type OrderDestinationStatus,
  type SavedDestination,
  type ForwardSummary,
  type OrderForwardView,
} from './admin'

export { buildHandoffEnvelope, absoluteImageUrl } from './payload'

export type {
  HandoffEnvelope,
  HandoffOrder,
  HandoffLine,
  HandoffAddress,
  HandoffAck,
} from './types'
