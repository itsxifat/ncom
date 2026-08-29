'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Picks an absolute moment, edited in the merchant's timezone and stored as a
 * UTC ISO instant.
 *
 * The two halves of that sentence are the reason this component exists. A
 * `datetime-local` input speaks wall-clock time with no zone — "2026-09-01T18:00"
 * — and writing that straight into a block's content is what makes a countdown
 * end at a different moment for a buyer in Dhaka than for one in London. So the
 * input stays local (that is what a merchant means when they say "six in the
 * evening") and everything that leaves this component is an instant.
 *
 * The presets are here because the honest answer to "when does this offer end"
 * is almost always a round number of hours or days from now, and typing a full
 * date to say "tomorrow" is the kind of friction that makes a feature go
 * unused.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const PRESETS: { label: string; ms: number }[] = [
  { label: '1 hour', ms: HOUR },
  { label: '6 hours', ms: 6 * HOUR },
  { label: '24 hours', ms: DAY },
  { label: '3 days', ms: 3 * DAY },
  { label: '7 days', ms: 7 * DAY },
]

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * MINUTE
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/**
 * Reads whatever is stored back into the local input.
 *
 * Tolerates the naive "YYYY-MM-DDTHH:mm" that this field used to store before
 * it picked a timezone, because pages saved then are still out there: `Date`
 * reads a zoneless string as local time, which is exactly what the merchant
 * meant when they typed it.
 */
function fromStored(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : toLocalInput(date)
}

/** "in 2 days 4 hours", or "3 hours ago" once the moment has passed. */
function describeDistance(ms: number): string {
  const past = ms < 0
  const total = Math.abs(ms)
  const days = Math.floor(total / DAY)
  const hours = Math.floor((total % DAY) / HOUR)
  const minutes = Math.floor((total % HOUR) / MINUTE)

  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (!days && minutes) parts.push(`${minutes} min${minutes === 1 ? '' : 's'}`)
  if (parts.length === 0) parts.push('less than a minute')

  return past ? `${parts.join(' ')} ago` : `in ${parts.join(' ')}`
}

export function DateTimeField({
  value,
  onChange,
}: {
  /** An ISO instant, or '' when nothing is set. */
  value: string
  onChange: (value: string) => void
}) {
  const local = fromStored(value)

  // Ticks once a minute so "in 2 hours" does not quietly go stale while the
  // merchant works, and stays null until mounted: the countdown between now and
  // a stored date is not something the server can render without guessing at
  // the merchant's clock.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const sync = () => setNow(Date.now())
    sync()
    const id = setInterval(sync, 30_000)
    return () => clearInterval(id)
  }, [])

  const parsed = value ? new Date(value) : null
  const target = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
  const expired = target !== null && now !== null && target.getTime() <= now

  function commitLocal(next: string) {
    if (!next) return onChange('')
    const date = new Date(next)
    if (Number.isNaN(date.getTime())) return
    onChange(date.toISOString())
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          value={local}
          onChange={(event) => commitLocal(event.target.value)}
          className="flex-1"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear date"
            onClick={() => onChange('')}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-muted-foreground self-center text-[11px]">
          From now:
        </span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              onChange(new Date(Date.now() + preset.ms).toISOString())
            }
            className="border-input hover:bg-muted rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
          >
            +{preset.label}
          </button>
        ))}
      </div>

      {/* Reads the stored instant back in words. A merchant who typed the date
          into the wrong month finds out here rather than from a customer. */}
      <p
        className={cn(
          'flex items-start gap-1.5 text-[11px] leading-relaxed',
          expired ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        <CalendarClock className="mt-px size-3.5 shrink-0" />
        <span>
          {!target ? (
            'No end time set — the block shows a “set a date” note until you pick one.'
          ) : (
            <>
              Ends{' '}
              {target.toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {now !== null && ` · ${describeDistance(target.getTime() - now)}`}
              {expired && ' — this has already passed.'}
            </>
          )}
        </span>
      </p>
    </div>
  )
}
