'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
}: {
  health: TrackingHealthShape
  events: TrackingEventRow[]
  total: number
  page: number
  pageSize: number
  filters: { destination: string; event: string; status: string; q: string }
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col gap-6">
      <HealthSummary health={health} />

      <form className="flex flex-wrap items-end gap-2" method="get">
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
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {events.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No events match these filters.
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            Delivery rate · 24h
          </span>
          <span
            className={`font-display text-2xl font-semibold ${healthy ? '' : 'text-destructive'}`}
          >
            {rate}%
          </span>
          <span className="text-muted-foreground text-xs">
            {health.succeeded} delivered, {health.failed} failed
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

function Select({
  name,
  defaultValue,
  label,
  children,
}: {
  name: string
  defaultValue: string
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        {children}
      </select>
    </label>
  )
}
