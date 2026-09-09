'use client'

import { useActionState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import {
  resendOrderAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LocalTime } from '@/components/app/local-time'

export interface OrderHandoffView {
  status: 'PENDING' | 'DELIVERED' | 'REFUSED' | 'FAILED'
  endpointUrl: string
  attempts: number
  nextAttemptAt: string | null
  deliveredAt: string | null
  remoteOrderNumber: string | null
  statusCode: number | null
  error: string | null
  conflictAt: string | null
  conflictReason: string | null
  syncedRevision: number
  revision: number
  pendingChanges: number
  failedChanges: number
}

/**
 * What happened to this order after it left.
 *
 * Takes the place of the courier panel rather than sitting beside it. An order
 * being packed by another system has no consignment to create here, and
 * offering to create one is how a parcel gets booked twice — so the panel that
 * offers it is not rendered at all for these orders.
 *
 * The undelivered states are the reason this panel exists. An order NCOM
 * accepted and the merchant's website never received is money already promised
 * to a customer that nobody is picking, and it is invisible unless something
 * says so on the order itself.
 */
export function OrderHandoffPanel({
  orderId,
  handoff,
  canResend,
}: {
  orderId: string
  handoff: OrderHandoffView
  canResend: boolean
}) {
  const [state, submit, pending] = useActionState<StoreActionState>(
    resendOrderAction.bind(null, orderId),
    undefined
  )

  const host = hostOf(handoff.endpointUrl)
  const delivered = handoff.status === 'DELIVERED'
  const waiting = handoff.status === 'PENDING'
  const conflicted = Boolean(handoff.conflictAt)
  const behind = handoff.revision > handoff.syncedRevision

  return (
    <Card
      className={delivered && !conflicted ? undefined : 'border-destructive/50'}
    >
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Sent to your website
          </h2>
          {delivered ? (
            <Badge variant="outline" className="text-emerald-600">
              <CheckCircle2 className="size-3.5" />
              Delivered
            </Badge>
          ) : waiting ? (
            <Badge variant="outline" className="text-amber-600">
              <Clock className="size-3.5" />
              On the way
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="size-3.5" />
              {handoff.status === 'REFUSED' ? 'Refused' : 'Not delivered'}
            </Badge>
          )}
        </div>

        {delivered ? (
          <p className="text-muted-foreground text-sm">
            {host} has this order
            {handoff.remoteOrderNumber && (
              <>
                {' '}
                as <strong>{handoff.remoteOrderNumber}</strong>
              </>
            )}
            {handoff.deliveredAt && (
              <>
                , delivered <LocalTime at={handoff.deliveredAt} />
              </>
            )}
            . It is processed there — NCOM does not screen, dispatch or fulfil
            it.
          </p>
        ) : waiting ? (
          <p className="text-muted-foreground text-sm">
            {host} has not acknowledged this order yet. It has been tried{' '}
            {handoff.attempts} {handoff.attempts === 1 ? 'time' : 'times'} and
            will be tried again
            {handoff.nextAttemptAt && (
              <>
                {' '}
                <LocalTime at={handoff.nextAttemptAt} />
              </>
            )}
            .
          </p>
        ) : (
          <p className="text-sm">
            <strong>This order is not on your website.</strong> It was tried{' '}
            {handoff.attempts} {handoff.attempts === 1 ? 'time' : 'times'} and{' '}
            {handoff.status === 'REFUSED' ? 'refused' : 'never acknowledged'}.
            Nobody is picking it until it lands there, or until you enter it by
            hand.
          </p>
        )}

        {/* A disagreement outranks everything else on this panel. The order
            arrived, so the delivery section above reads as fine — and it is;
            what is wrong is that the two copies have since stopped matching,
            which nothing else here would say. */}
        {conflicted && (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-md border p-3">
            <p className="text-destructive flex items-start gap-2 text-sm font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              This order says different things here and on {host}
            </p>
            <p className="text-muted-foreground text-sm">
              {handoff.conflictReason ??
                'Somebody changed it in both places at once.'}
            </p>
            <p className="text-muted-foreground text-sm">
              Nothing further is being sent for this order. Compare the two
              copies, make them match by hand, and send it again — whichever
              version you keep, keep it deliberately.
            </p>
          </div>
        )}

        {!conflicted && behind && (
          <p className="text-muted-foreground text-sm">
            {handoff.pendingChanges > 0
              ? `${handoff.pendingChanges} later ${handoff.pendingChanges === 1 ? 'change is' : 'changes are'} still on the way to ${host}.`
              : handoff.failedChanges > 0
                ? `${handoff.failedChanges} later ${handoff.failedChanges === 1 ? 'change' : 'changes'} could not be delivered to ${host}. Send it again.`
                : `${host} has not been told about the latest change to this order yet.`}
          </p>
        )}

        {handoff.error && !delivered && (
          <p className="text-destructive bg-destructive/5 rounded-md p-3 text-xs">
            {handoff.statusCode ? `${handoff.statusCode} — ` : ''}
            {handoff.error}
          </p>
        )}

        {state?.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-emerald-600">{state.success}</p>
        )}

        {(!delivered || conflicted || handoff.failedChanges > 0) &&
          canResend && (
            <form action={submit}>
              <Button
                variant="outline"
                size="sm"
                type="submit"
                disabled={pending}
              >
                <RefreshCw className={pending ? 'animate-spin' : undefined} />
                Send it again
              </Button>
            </form>
          )}
      </CardContent>
    </Card>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'your website'
  }
}
