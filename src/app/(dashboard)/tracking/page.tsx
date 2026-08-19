import { Activity } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  listTrackingEvents,
  trackingHealth,
} from '@/server/services/trackingService'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/empty-state'
import { TrackingEventExplorer } from '@/components/store/tracking-event-explorer'
import type {
  TrackingDestination,
  TrackingEventName,
} from '@/generated/prisma/enums'

export const metadata = { title: 'Tracking' }

const DESTINATIONS = ['META_CAPI', 'GA4_MP'] as const
const EVENTS = ['PAGE_VIEW', 'VIEW_CONTENT', 'PURCHASE'] as const
const STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED'] as const

const PAGE_SIZE = 50

/**
 * Every conversion this workspace reported, and what the ad platform said back.
 *
 * The reason this page exists rather than a green tick in settings: server-side
 * tracking fails silently by construction. The buyer completes their order, the
 * merchant sees the sale, and the only thing that went wrong is that Meta never
 * heard about it — no error surfaces anywhere a merchant looks, and the first
 * symptom is an ad account that has quietly stopped optimising, discovered
 * weeks later. What that costs is not the conversion; it is every bid placed on
 * bad data since.
 *
 * So the raw exchange is shown, both directions. A merchant with a failing
 * pixel needs the response body, not a summary of it, and the alternative is
 * reading it to someone over a support call.
 */
export default async function TrackingPage({
  searchParams,
}: PageProps<'/tracking'>) {
  const query = await searchParams
  const { organization } = await getActiveOrganization()

  const destination = DESTINATIONS.find(
    (value) => value === query.destination
  ) as TrackingDestination | undefined
  const eventName = EVENTS.find((value) => value === query.event) as
    TrackingEventName | undefined
  const status = STATUSES.find((value) => value === query.status)
  const search = typeof query.q === 'string' ? query.q.trim() : undefined
  const page = Math.max(1, Number(query.page) || 1)

  const [health, { items, total }] = await Promise.all([
    trackingHealth(organization.id, { sinceHours: 24 }),
    listTrackingEvents(organization.id, {
      destination,
      eventName,
      status,
      search: search || undefined,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ])

  const unfiltered = !destination && !eventName && !status && !search

  if (total === 0 && unfiltered) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Marketing"
          title="Tracking"
          description="Conversions reported to Meta and Google, and what they said back."
        />
        <EmptyState
          icon={Activity}
          title="No events reported yet"
          description="Once a store has a Meta access token or a GA4 API secret saved, every page view, product view and purchase it reports will appear here with the full request and response."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Marketing"
        title="Tracking"
        description="Conversions reported to Meta and Google, and what they said back."
      />

      <TrackingEventExplorer
        health={health}
        events={items.map((row) => ({
          id: row.id,
          destination: row.destination,
          eventName: row.eventName,
          eventId: row.eventId,
          status: row.status,
          attempts: row.attempts,
          statusCode: row.statusCode,
          error: row.error,
          responseBody: row.responseBody,
          payload: row.payload,
          storeName: row.store?.name ?? null,
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
          nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
        }))}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        filters={{
          destination: destination ?? '',
          event: eventName ?? '',
          status: status ?? '',
          q: search ?? '',
        }}
      />
    </div>
  )
}
