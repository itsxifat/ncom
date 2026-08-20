import { getActiveOrganization } from '@/server/services/organizationService'
import { getEntitlements } from '@/server/services/entitlementService'
import {
  listStoreTrackingSetups,
  listTrackingEvents,
  trackingHealth,
} from '@/server/services/trackingService'
import { PageHeader } from '@/components/app/page-header'
import { TrackingDestinations } from '@/components/store/tracking-destinations'
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
 * Where every store reports to, and what the ad platforms said back.
 *
 * Both halves are here on purpose. Tracking credentials used to be edited
 * inside one store's settings, which made a workspace-wide question — "is
 * anything still reporting" — into six page loads and a memory test. And the
 * reason the log sits directly beneath the credentials is that server-side
 * tracking fails silently by construction: the buyer completes their order, the
 * merchant sees the sale, and the only thing that went wrong is that Meta never
 * heard about it. No error surfaces anywhere a merchant looks, and the first
 * symptom is an ad account that quietly stopped optimising, discovered weeks
 * later. What that costs is not the conversion; it is every bid placed on bad
 * data since.
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
  const storeId = typeof query.store === 'string' ? query.store : undefined
  const page = Math.max(1, Number(query.page) || 1)

  const [stores, entitlements, health, { items, total }] = await Promise.all([
    listStoreTrackingSetups(organization.id),
    getEntitlements(organization.id),
    trackingHealth(organization.id, { sinceHours: 24, storeId }),
    listTrackingEvents(organization.id, {
      storeId,
      destination,
      eventName,
      status,
      search: search || undefined,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Marketing"
        title="Tracking"
        description="Pixels, Conversions API and GA4 for every store — and every event this server reported, with what came back."
      />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Destinations
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            One card per store. A pixel ID on its own renders the browser tag;
            adding the access token beside it reports the same events from this
            server, where an ad blocker cannot stop them.
          </p>
        </div>

        <TrackingDestinations
          stores={stores.map((store) => ({
            ...store,
            updatedAt: store.updatedAt?.toISOString() ?? null,
          }))}
          // Each tag is its own line on the price sheet, and the save is
          // refused without it — so the form says which ones this plan allows
          // rather than letting a merchant discover it by losing a form.
          features={{
            planName: entitlements.planName,
            metaPixel: entitlements.features.META_PIXEL,
            googleAnalytics: entitlements.features.GOOGLE_ANALYTICS,
            googleTagManager: entitlements.features.GOOGLE_TAG_MANAGER,
          }}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Events
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Live. Page views and product views are sent once as the page
            renders; purchases are queued and retried until Meta and Google
            confirm them.
          </p>
        </div>

        <TrackingEventExplorer
          health={health}
          stores={stores.map((store) => ({
            id: store.storeId,
            name: store.name,
          }))}
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
            store: storeId ?? '',
            destination: destination ?? '',
            event: eventName ?? '',
            status: status ?? '',
            q: search ?? '',
          }}
        />
      </section>
    </div>
  )
}
