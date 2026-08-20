'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Pause,
  Play,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/ui/form-select'
import type {
  TrackingDestination,
  TrackingEventName,
} from '@/generated/prisma/enums'

const DESTINATION_LABEL: Record<TrackingDestination, string> = {
  META_CAPI: 'Meta CAPI',
  GA4_MP: 'GA4',
}

const EVENT_LABEL: Record<TrackingEventName, string> = {
  PAGE_VIEW: 'Page view',
  VIEW_CONTENT: 'Product view',
  PURCHASE: 'Purchase',
}

export interface TrackingEventRow {
  id: string
  destination: TrackingDestination
  eventName: TrackingEventName
  eventId: string
  status: string
  attempts: number
  statusCode: number | null
  error: string | null
  responseBody: string | null
  payload: unknown
  storeName: string | null
  createdAt: string
  completedAt: string | null
  nextAttemptAt: string | null
}

export interface TrackingHealthShape {
  total: number
  succeeded: number
  failed: number
  pending: number
  successRateBps: number
  byDestination: {
    destination: TrackingDestination
    total: number
    failed: number
  }[]
  byEvent: { eventName: TrackingEventName; total: number; failed: number }[]
}

/**
 * The tracking log, with the raw exchange one click away.
 *
 * Health first, then the stream. The summary is scoped to the last 24 hours
 * while the list is not, because they answer different questions: "is it
 * working right now" is a question about today, and "what happened to this one
 * conversion" is a question about a specific event that may be weeks old.
 */
export function TrackingEventExplorer({
  health,
  events,
  total,
  page,
  pageSize,
  filters,
  stores,
}: {
  health: TrackingHealthShape
  events: TrackingEventRow[]
  total: number
  page: number
  pageSize: number
  filters: {
    destination: string
    event: string
    status: string
    q: string
    store: string
  }
  /** Every store in the workspace, so the log can be narrowed to one site. */
  stores: { id: string; name: string }[]
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const filtered = Object.values(filters).some((value) => value !== '')

  return (
    <div className="flex flex-col gap-6">
      <HealthSummary health={health} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <Select
            name="store"
            defaultValue={filters.store}
            label="Store"
            placeholder="Every store"
          >
            <option value="">Every store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
          <Select
            name="destination"
            defaultValue={filters.destination}
            label="Destination"
          >
            <option value="">Any destination</option>
            <option value="META_CAPI">Meta CAPI</option>
            <option value="GA4_MP">GA4</option>
          </Select>
          <Select name="event" defaultValue={filters.event} label="Event">
            <option value="">Any event</option>
            <option value="PAGE_VIEW">Page view</option>
            <option value="VIEW_CONTENT">Product view</option>
            <option value="PURCHASE">Purchase</option>
          </Select>
          <Select name="status" defaultValue={filters.status} label="Status">
            <option value="">Any status</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </Select>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Event ID</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Trace one conversion"
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm"
            />
          </label>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>

        <LiveToggle />
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm text-pretty">
            {filtered
              ? 'No events match these filters.'
              : 'Nothing reported yet. Save a pixel ID or an access token above, then open a published page — every event this server sends lands here within seconds.'}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {total} events · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/tracking?${new URLSearchParams({ ...filters, page: String(page - 1) })}`}
                className="underline"
              >
                Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={`/tracking?${new URLSearchParams({ ...filters, page: String(page + 1) })}`}
                className="underline"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function HealthSummary({ health }: { health: TrackingHealthShape }) {
  const rate = (health.successRateBps / 100).toFixed(1)
  const healthy = health.successRateBps >= 9500
  // A rate needs something to be a rate *of*. Reporting 100% over an empty
  // window tells a merchant whose tracking has stopped entirely that everything
  // is fine, which is the exact case this panel exists to catch.
  const measured = health.succeeded + health.failed > 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            Delivery rate · 24h
          </span>
          <span
            className={`font-display text-2xl font-semibold ${measured && !healthy ? 'text-destructive' : ''}`}
          >
            {measured ? `${rate}%` : '—'}
          </span>
          <span className="text-muted-foreground text-xs">
            {measured
              ? `${health.succeeded} delivered, ${health.failed} failed`
              : 'nothing sent in the last 24 hours'}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Events · 24h</span>
          <span className="font-display text-2xl font-semibold">
            {health.total}
          </span>
          <span className="text-muted-foreground text-xs">
            {health.pending} still retrying
          </span>
        </CardContent>
      </Card>

      {/* Split by destination, because "Meta is down" and "everything is down"
          need different responses and a single rate hides which one it is. */}
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">By destination</span>
          {health.byDestination.length === 0 ? (
            <span className="text-muted-foreground text-sm">No events</span>
          ) : (
            health.byDestination.map((row) => (
              <div
                key={row.destination}
                className="flex items-center justify-between text-sm"
              >
                <span>{DESTINATION_LABEL[row.destination]}</span>
                <span
                  className={row.failed > 0 ? 'text-destructive' : undefined}
                >
                  {row.total - row.failed}/{row.total}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">By event</span>
          {health.byEvent.length === 0 ? (
            <span className="text-muted-foreground text-sm">No events</span>
          ) : (
            health.byEvent.map((row) => (
              <div
                key={row.eventName}
                className="flex items-center justify-between text-sm"
              >
                <span>{EVENT_LABEL[row.eventName]}</span>
                <span
                  className={row.failed > 0 ? 'text-destructive' : undefined}
                >
                  {row.total - row.failed}/{row.total}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EventRow({ event }: { event: TrackingEventRow }) {
  const [open, setOpen] = useState(false)

  const icon =
    event.status === 'SUCCEEDED' ? (
      <CheckCircle2 className="size-4 text-lime-600" />
    ) : event.status === 'FAILED' ? (
      <AlertTriangle className="text-destructive size-4" />
    ) : (
      <Clock className="text-muted-foreground size-4" />
    )

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 text-left"
        >
          {icon}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{EVENT_LABEL[event.eventName]}</span>
            <Badge variant="outline">
              {DESTINATION_LABEL[event.destination]}
            </Badge>
            {event.statusCode != null && (
              <span
                className={`text-xs ${event.status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                HTTP {event.statusCode}
              </span>
            )}
            {event.attempts > 1 && (
              <span className="text-muted-foreground text-xs">
                {event.attempts} attempts
              </span>
            )}
            {event.storeName && (
              <span className="text-muted-foreground text-xs">
                {event.storeName}
              </span>
            )}
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">
            {new Date(event.createdAt).toLocaleString()}
          </span>
          <ChevronDown
            className={`text-muted-foreground size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {event.error && !open && (
          <p className="text-destructive pl-7 text-sm text-pretty">
            {event.error}
          </p>
        )}

        {open && (
          <div className="flex flex-col gap-3 pl-7">
            <Detail label="Event ID">
              {/* The value that ties the browser's copy to this one. Shown
                  because it is what a merchant pastes into Meta's Events
                  Manager to prove the two were deduplicated. */}
              <code className="text-xs break-all">{event.eventId}</code>
            </Detail>

            {event.nextAttemptAt && (
              <Detail label="Next attempt">
                {new Date(event.nextAttemptAt).toLocaleString()}
              </Detail>
            )}

            {event.error && (
              <Detail label="Error">
                <span className="text-destructive text-sm">{event.error}</span>
              </Detail>
            )}

            <Detail label="Request sent">
              <Payload value={event.payload} />
            </Detail>

            {event.responseBody && (
              <Detail label="Response">
                <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">
                  {event.responseBody}
                </pre>
              </Detail>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  )
}

function Payload({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/**
 * Keeps the log current without anyone reloading it.
 *
 * Events arrive here from page renders and from the retry sweep — that is,
 * from everywhere except this tab — so a static list is out of date the moment
 * it renders. Ten seconds is fast enough to watch a test event land and slow
 * enough not to re-query the log on every blink. Pausable, because reading a
 * failed payload while the list reorders underneath you is maddening.
 */
function LiveToggle() {
  const router = useRouter()
  const [live, setLive] = useState(true)

  useEffect(() => {
    if (!live) return

    const id = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(id)
  }, [live, router])

  return (
    <Button
      type="button"
      variant={live ? 'outline' : 'ghost'}
      onClick={() => setLive((value) => !value)}
      aria-pressed={live}
    >
      {live ? (
        <>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-lime-500" />
          </span>
          Live
          <Pause className="size-3.5" />
        </>
      ) : (
        <>
          <Play className="size-3.5" />
          Paused
        </>
      )}
    </Button>
  )
}

function Select({
  name,
  defaultValue,
  label,
  placeholder,
  children,
}: {
  name: string
  defaultValue: string
  label: string
  placeholder?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <FormSelect
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-40"
      >
        {children}
      </FormSelect>
    </label>
  )
}
