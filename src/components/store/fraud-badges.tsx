import { Badge } from '@/components/ui/badge'
import {
  SHIPMENT_STATUS_LABEL,
  WORKFLOW_STATE_LABEL,
} from '@/server/courier/statusMap'
import {
  DEFAULT_STATUS_COLORS,
  TONE_STYLES,
  type StatusTone,
} from '@/lib/order-status-colors'
import type {
  CourierShipmentStatus,
  FraudVerdict,
  OrderWorkflowState,
} from '@/generated/prisma/enums'

/**
 * Courier and screening badges.
 *
 * Centralised for the same reason the order status badges are: a merchant
 * scanning a list learns the colour language once. The convention across this
 * file — lime is settled and good, destructive is money at risk, secondary is
 * in motion, outline is waiting — matches status-badges.tsx exactly, so the two
 * families can sit side by side on an order row without contradicting each
 * other.
 */

const VERDICT_TONE: Record<FraudVerdict, StatusTone> = {
  PASS: 'green',
  REVIEW: 'amber',
  FAIL: 'red',
  UNAVAILABLE: 'none',
}

/**
 * The verdict in the words a merchant would use about a customer, not the
 * screen's: "Reliable" and "Risky" say what to do with the parcel, where
 * "Screened clean" and "Fraud risk" described the check.
 */
export const VERDICT_LABEL: Record<FraudVerdict, string> = {
  PASS: 'Reliable',
  REVIEW: 'Check first',
  FAIL: 'Risky',
  UNAVAILABLE: 'Not checked',
}

export function FraudVerdictBadge({ verdict }: { verdict: FraudVerdict }) {
  return (
    <Badge className={TONE_STYLES[VERDICT_TONE[verdict]].pill}>
      {VERDICT_LABEL[verdict]}
    </Badge>
  )
}

/**
 * Where an order is, in the merchant's own status colours when they have set
 * them (Orders → status colours) and the defaults otherwise — so a pill on
 * Home, on the order list and on the order itself is the same colour for the
 * same state.
 */
export function WorkflowStateBadge({
  state,
  tone = DEFAULT_STATUS_COLORS[state],
}: {
  state: OrderWorkflowState
  tone?: StatusTone
}) {
  return (
    <Badge className={TONE_STYLES[tone].pill}>
      {WORKFLOW_STATE_LABEL[state]}
    </Badge>
  )
}

const SHIPMENT_VARIANT: Record<
  CourierShipmentStatus,
  'default' | 'lime' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'outline',
  SUBMITTED: 'secondary',
  PICKUP_PENDING: 'secondary',
  PICKED_UP: 'secondary',
  IN_TRANSIT: 'secondary',
  OUT_FOR_DELIVERY: 'secondary',
  DELIVERED: 'lime',
  PARTIALLY_DELIVERED: 'secondary',
  ON_HOLD: 'destructive',
  RETURN_IN_TRANSIT: 'destructive',
  RETURNED: 'destructive',
  CANCELLED: 'outline',
  DELIVERY_FAILED: 'destructive',
  UNKNOWN: 'outline',
}

export function ShipmentStatusBadge({
  status,
}: {
  status: CourierShipmentStatus
}) {
  return (
    <Badge variant={SHIPMENT_VARIANT[status]}>
      {SHIPMENT_STATUS_LABEL[status]}
    </Badge>
  )
}

/**
 * The four numbers behind a verdict.
 *
 * Shown alongside every verdict rather than only on request: a merchant
 * overriding an automated refusal is making a judgement call, and "12 delivered,
 * 9 refused" is what they need to make it. The verdict alone just tells them
 * what the machine thought.
 */
export function FraudStats({
  delivered,
  cancelled,
  frauds,
  successRateBps,
}: {
  delivered: number | null
  cancelled: number | null
  frauds: number | null
  successRateBps: number | null
}) {
  if (delivered == null && cancelled == null && frauds == null) return null

  const rate = successRateBps == null ? null : successRateBps / 100

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
      <Stat
        label="Delivery rate"
        value={
          rate == null
            ? '—'
            : `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`
        }
      />
      <Stat label="Delivered" value={delivered ?? 0} />
      <Stat label="Refused" value={cancelled ?? 0} />
      <Stat
        label="Fraud reports"
        value={frauds ?? 0}
        emphasis={(frauds ?? 0) > 0}
      />
    </dl>
  )
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string | number
  emphasis?: boolean
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={emphasis ? 'text-destructive font-medium' : 'font-medium'}>
        {value}
      </dd>
    </div>
  )
}
