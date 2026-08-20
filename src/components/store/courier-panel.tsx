'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  PackageCheck,
  PencilLine,
  RefreshCw,
  Send,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react'
import {
  approveOrderAction,
  dispatchOrderAction,
  recheckOrderFraudAction,
  rejectOrderAction,
  setOrderStatusAction,
} from '@/app/(dashboard)/courier-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { FormSelect } from '@/components/ui/form-select'
import { formatMoney } from '@/lib/money'
import {
  MANUAL_WORKFLOW_STATES,
  WORKFLOW_STATE_LABEL,
  type ManualWorkflowState,
} from '@/server/courier/statusMap'
import {
  FraudStats,
  FraudVerdictBadge,
  ShipmentStatusBadge,
  WorkflowStateBadge,
} from './fraud-badges'
import type {
  CourierProvider,
  CourierShipmentStatus,
  FraudVerdict,
  OrderWorkflowState,
} from '@/generated/prisma/enums'

export interface CourierPanelShipment {
  provider: CourierProvider
  status: CourierShipmentStatus
  statusMessage: string | null
  consignmentId: string | null
  trackingCode: string | null
  trackingUrl: string | null
  lastError: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  events: {
    id: string
    status: CourierShipmentStatus
    message: string
    occurredAt: string
    source: string
  }[]
}

export interface CourierPanelProps {
  orderId: string
  workflowState: OrderWorkflowState
  cancelled: boolean
  fraud: {
    verdict: FraudVerdict | null
    reason: string | null
    checkedAt: string | null
    delivered: number | null
    cancelled: number | null
    frauds: number | null
    successRateBps: number | null
  }
  shipment: CourierPanelShipment | null
  /** Couriers switched on for this workspace, for the dispatch picker. */
  providers: { provider: CourierProvider; label: string; isDefault: boolean }[]
  /** What is still owed, so a hand delivery can book the cash it collected. */
  outstandingCents: number
  currencyCode: string
  /** The customer's tracking page, once one has been minted. */
  trackingToken: string | null
}

/**
 * Everything the courier pipeline knows about one order, and the decisions a
 * merchant can make on it.
 *
 * Three states, shown in priority order because they are mutually exclusive in
 * practice: an order waiting on a human decision, an order cleared but not yet
 * sent, and an order that is already a parcel somewhere in the country.
 */
export function CourierPanel({
  orderId,
  workflowState,
  cancelled,
  fraud,
  shipment,
  providers,
  outstandingCents,
  currencyCode,
  trackingToken,
}: CourierPanelProps) {
  const router = useRouter()

  // A parcel in motion changes without anything happening in this tab —
  // couriers push updates to the webhook endpoint, which writes to the database
  // the page reads. Refreshing on an interval is what turns that into a live
  // view; the alternative is a merchant staring at a stale page and reloading
  // by hand. Stopped once the parcel stops moving, so a delivered order is not
  // polling forever in a background tab.
  const inMotion =
    shipment != null &&
    !['DELIVERED', 'RETURNED', 'CANCELLED', 'PARTIALLY_DELIVERED'].includes(
      shipment.status
    )

  useEffect(() => {
    if (!inMotion) return

    const id = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(id)
  }, [inMotion, router])

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Truck className="size-4" />
            Delivery
          </h2>
          <WorkflowStateBadge state={workflowState} />
        </div>

        <ScreeningBlock orderId={orderId} fraud={fraud} />

        {workflowState === 'FRAUD_REVIEW' && !cancelled && (
          <ReviewDecision orderId={orderId} providers={providers} />
        )}

        {/*
          A shipment row is written *before* the courier is called, so its mere
          existence does not mean a parcel exists. The consignment id is what
          says the courier accepted it. Keying the view on the row instead left
          a failed dispatch showing its error with no way to act on it — the one
          screen where a retry is obviously wanted was the one that lacked it.
        */}
        {shipment?.consignmentId ? (
          <ShipmentBlock shipment={shipment} />
        ) : (
          !cancelled &&
          workflowState !== 'FRAUD_REVIEW' && (
            <DispatchBlock
              orderId={orderId}
              providers={providers}
              failed={shipment}
            />
          )
        )}

        {/* Last, because it is the fallback: the merchant reaches for it when
            no courier is doing the reporting, or when the one that is has got
            it wrong. */}
        {!cancelled && (
          <ManualStatusBlock
            orderId={orderId}
            workflowState={workflowState}
            withCourier={Boolean(shipment?.consignmentId)}
            outstandingCents={outstandingCents}
            currencyCode={currencyCode}
          />
        )}

        {trackingToken && <TrackingLink token={trackingToken} />}
      </CardContent>
    </Card>
  )
}

function ScreeningBlock({
  orderId,
  fraud,
}: {
  orderId: string
  fraud: CourierPanelProps['fraud']
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Always offered, even before a first check: an order that arrived while the
  // portal was down has no verdict at all, and this is how the merchant gets
  // one without placing another order.
  const recheck = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          setError(null)
          const result = await recheckOrderFraudAction(orderId)
          if (!result.ok) setError(result.error ?? 'Re-check failed')
          router.refresh()
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Re-check
    </Button>
  )

  if (!fraud.verdict) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          This customer has not been screened.
        </p>
        {recheck}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FraudVerdictBadge verdict={fraud.verdict} />
          {fraud.checkedAt && (
            <span className="text-muted-foreground text-xs">
              checked {new Date(fraud.checkedAt).toLocaleString()}
            </span>
          )}
        </div>
        {recheck}
      </div>

      {fraud.reason && <p className="text-sm text-pretty">{fraud.reason}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <FraudStats
        delivered={fraud.delivered}
        cancelled={fraud.cancelled}
        frauds={fraud.frauds}
        successRateBps={fraud.successRateBps}
      />
    </div>
  )
}

/**
 * Release or refuse a held order.
 *
 * The note is optional but prompted for, because the next person to look at
 * this order — or the same person in three weeks — will want to know why a
 * flagged customer was let through.
 */
function ReviewDecision({
  orderId,
  providers,
}: {
  orderId: string
  providers: CourierPanelProps['providers']
}) {
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [provider, setProvider] = useState<CourierProvider | ''>(
    providers.find((entry) => entry.isDefault)?.provider ??
      providers[0]?.provider ??
      ''
  )

  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <ShieldAlert className="text-destructive mt-0.5 size-4 shrink-0" />
        <p className="text-sm text-pretty">
          This order is held. Nothing ships until you or a moderator decides.
        </p>
      </div>

      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Why? (optional, kept on the order)"
        className="bg-background"
      />

      {providers.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {providers.map((entry) => (
            <Button
              key={entry.provider}
              type="button"
              size="sm"
              variant={provider === entry.provider ? 'default' : 'outline'}
              onClick={() => setProvider(entry.provider)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await approveOrderAction(
                orderId,
                provider || null,
                note.trim() || undefined
              )
              if (!result.ok) setError(result.error ?? 'Approval failed')
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Approve &amp; send
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await rejectOrderAction(
                orderId,
                note.trim() || undefined
              )
              if (!result.ok) setError(result.error ?? 'Rejection failed')
              router.refresh()
            })
          }
        >
          <X />
          Reject &amp; cancel
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}

/**
 * Sends an order to a courier, or sends it again after a failure.
 *
 * One component for both because they are the same action — the only
 * difference is that a previous attempt left an error worth reading before
 * pressing the button a second time.
 */
function DispatchBlock({
  orderId,
  providers,
  failed,
}: {
  orderId: string
  providers: CourierPanelProps['providers']
  /** A shipment row whose courier call did not produce a consignment. */
  failed?: CourierPanelShipment | null
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (providers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No courier is switched on. Connect one in courier settings to dispatch
        this order.
      </p>
    )
  }

  // The previous attempt's error, until this attempt produces its own.
  const message = error ?? failed?.lastError ?? null

  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-start gap-2 rounded-lg border p-3">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Could not send this to the courier.</p>
            {message && (
              <p className="text-muted-foreground text-pretty">{message}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Not sent to a courier yet.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {providers.map((entry) => (
          <Button
            key={entry.provider}
            type="button"
            size="sm"
            variant={entry.isDefault ? 'default' : 'outline'}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const result = await dispatchOrderAction(
                  orderId,
                  entry.provider
                )
                if (!result.ok) setError(result.error ?? 'Dispatch failed')
                router.refresh()
              })
            }
          >
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : failed ? (
              <RefreshCw />
            ) : (
              <Send />
            )}
            {failed
              ? providers.length > 1
                ? `Try again with ${entry.label}`
                : 'Try again'
              : `Send via ${entry.label}`}
          </Button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}

/**
 * Moving an order by hand.
 *
 * The pipeline is built around couriers that report back, and most orders in
 * this market do go out that way. The ones that do not are not edge cases: a
 * shop's own rider covers the neighbourhood, a customer collects at the shop,
 * a wholesale order goes out on a van. Those orders need the same ladder, and
 * without this control they stay PENDING forever while the merchant remembers
 * their real state in their head.
 *
 * Offered even when a courier *is* carrying the parcel, because the other half
 * of this problem is a courier whose webhook never arrived. What it says then
 * is written onto the consignment too, so the correction is not undone by the
 * next reconciliation sweep.
 */
function ManualStatusBlock({
  orderId,
  workflowState,
  withCourier,
  outstandingCents,
  currencyCode,
}: {
  orderId: string
  workflowState: OrderWorkflowState
  withCourier: boolean
  outstandingCents: number
  currencyCode: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Starts on where the order already is, when that is a state a person is
  // allowed to set. Anything else — screening states — starts at the first
  // step, because those orders have not physically moved yet.
  const [state, setState] = useState<ManualWorkflowState>(
    MANUAL_WORKFLOW_STATES.find((value) => value === workflowState) ??
      'PROCESSING'
  )
  const [note, setNote] = useState('')
  const [recordPayment, setRecordPayment] = useState(true)

  const arrived = state === 'DELIVERED' || state === 'PARTIALLY_DELIVERED'
  const canSettle = arrived && outstandingCents > 0

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <PencilLine className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">Set the status yourself</p>
          <p className="text-muted-foreground text-sm text-pretty">
            {withCourier
              ? 'This order is with a courier. Setting a status here overrides what they last reported — use it when their updates have stopped.'
              : 'For orders you deliver yourself or hand over outside a courier. The customer’s tracking page shows whatever you set here.'}
          </p>
        </div>
      </div>

      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What happened? (optional, kept on the order)"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* The trigger is `w-full` at this size, so the width lives on a
            wrapper rather than fighting the variant for it. */}
        <div className="sm:w-56">
          <FormSelect
            value={state}
            onChange={(event) =>
              setState(event.target.value as ManualWorkflowState)
            }
            aria-label="Delivery status"
          >
            {MANUAL_WORKFLOW_STATES.map((value) => (
              <option key={value} value={value}>
                {WORKFLOW_STATE_LABEL[value]}
              </option>
            ))}
          </FormSelect>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              setDone(false)
              const result = await setOrderStatusAction(orderId, state, {
                note: note.trim() || undefined,
                recordPayment: canSettle && recordPayment,
              })
              if (result.ok) {
                setDone(true)
                setNote('')
              } else {
                setError(result.error ?? 'Could not update the status')
              }
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Update status
        </Button>
      </div>

      {/* Only when there is money outstanding and the goods have arrived.
          Marking a parcel delivered is not the same claim as saying the rider
          came back with the cash, and a shop that gets paid by bank transfer
          would find its ledger quietly invented otherwise. */}
      {canSettle && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={recordPayment} onCheckedChange={setRecordPayment} />
          Record {formatMoney(outstandingCents, currencyCode)} as collected
        </label>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
      {done && !error && (
        <p className="text-muted-foreground text-sm">
          Status updated to {WORKFLOW_STATE_LABEL[state]}.
        </p>
      )}
    </div>
  )
}

/**
 * The customer's tracking page, for a merchant to send on.
 *
 * A cash-on-delivery buyer has no account and often no email, so the link gets
 * to them over whatever the shop actually uses — which in practice is a message
 * pasted into WhatsApp. That makes "copy" the whole feature.
 */
function TrackingLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const path = `/track/${token}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Customer tracking link</p>
        <p className="text-muted-foreground truncate text-xs">{path}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(
              new URL(path, window.location.origin).toString()
            )
            setCopied(true)
          }}
        >
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<a href={path} target="_blank" rel="noreferrer" />}
        >
          Open
          <ExternalLink />
        </Button>
      </div>
    </div>
  )
}

function ShipmentBlock({ shipment }: { shipment: CourierPanelShipment }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium">
            <PackageCheck className="size-4" />
            {shipment.provider === 'STEADFAST' ? 'Steadfast' : 'Pathao'}
          </span>
          <ShipmentStatusBadge status={shipment.status} />
        </div>

        {shipment.statusMessage && (
          <p className="text-muted-foreground text-sm text-pretty">
            {shipment.statusMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {shipment.trackingCode && (
            <span className="text-muted-foreground">
              Tracking{' '}
              <code className="text-foreground">{shipment.trackingCode}</code>
            </span>
          )}
          {shipment.consignmentId &&
            shipment.consignmentId !== shipment.trackingCode && (
              <span className="text-muted-foreground">
                Consignment{' '}
                <code className="text-foreground">
                  {shipment.consignmentId}
                </code>
              </span>
            )}
          {shipment.trackingUrl && (
            <a
              href={shipment.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              Track on courier site
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>

        {shipment.lastError && (
          <p className="text-destructive text-sm">{shipment.lastError}</p>
        )}
      </div>

      {shipment.events.length > 0 && (
        <ol className="flex flex-col gap-3">
          {shipment.events.map((event) => (
            <li key={event.id} className="flex gap-3 text-sm">
              <span
                className="bg-border mt-1.5 size-2 shrink-0 rounded-full"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-pretty">{event.message}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(event.occurredAt).toLocaleString()}
                  {event.source === 'POLL' && (
                    <Badge variant="outline" className="ml-2">
                      polled
                    </Badge>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
