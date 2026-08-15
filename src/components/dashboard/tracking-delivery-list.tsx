import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import type {
  TrackingDestination,
  TrackingDeliveryStatus,
  TrackingEventName,
} from '@/generated/prisma/client'

/**
 * What actually reached Meta and Google.
 *
 * "Did my sale get through?" is the only question a merchant asks of
 * server-side tracking once it is set up, and neither ad platform answers it —
 * Meta's Events Manager lags by minutes to hours, and GA4 shows nothing at all
 * for a day. Reading it out of the delivery queue is instant, and a failure
 * here carries the platform's own error message rather than an absence a
 * merchant has to notice for themselves.
 */

export interface TrackingDeliveryRow {
  id: string
  destination: TrackingDestination
  eventName: TrackingEventName
  status: TrackingDeliveryStatus
  attempts: number
  error: string | null
  createdAt: Date
  completedAt: Date | null
}

const DESTINATION_LABELS: Record<TrackingDestination, string> = {
  META_CAPI: 'Meta',
  GA4_MP: 'Google Analytics',
}

const EVENT_LABELS: Record<TrackingEventName, string> = {
  PAGE_VIEW: 'Page view',
  VIEW_CONTENT: 'Product view',
  PURCHASE: 'Purchase',
}

export function TrackingDeliveryList({
  deliveries,
}: {
  deliveries: TrackingDeliveryRow[]
}) {
  return (
    <ul className="divide-foreground/6 divide-y text-sm">
      {deliveries.map((delivery) => (
        <li key={delivery.id} className="flex items-start gap-3 py-3">
          <StatusIcon status={delivery.status} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {EVENT_LABELS[delivery.eventName]} →{' '}
              {DESTINATION_LABELS[delivery.destination]}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatWhen(delivery.completedAt ?? delivery.createdAt)}
              {delivery.attempts > 1 && ` · ${delivery.attempts} attempts`}
            </p>
            {delivery.error && (
              <p className="text-destructive mt-1 text-xs break-words">
                {delivery.error}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function StatusIcon({ status }: { status: TrackingDeliveryStatus }) {
  if (status === 'SUCCEEDED') {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
  }
  if (status === 'FAILED') {
    return <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
  }
  // Pending means a retry is scheduled, not that anything is wrong yet.
  return <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
