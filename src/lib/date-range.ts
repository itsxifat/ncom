/**
 * Date windows for reporting.
 *
 * Every range here is resolved in the *store's* timezone, not the server's.
 * "Today" for a Dhaka merchant starts at midnight Dhaka time; computing it in
 * UTC puts the first six hours of their day in yesterday's bucket, which makes
 * the daily numbers wrong in a way nobody notices until they are reconciled
 * against a bank statement.
 *
 * Ranges are half-open — `start <= t < end` — so consecutive windows tile
 * without double-counting the boundary instant.
 */

/**
 * The reporting timezone.
 *
 * A single value rather than per-organisation because this platform's commerce
 * side is built for Bangladesh — the couriers, the phone format and the
 * cash-on-delivery model all assume it. If that stops being true, this is the
 * one constant to lift onto OrganizationSettings.
 */
export const REPORTING_TIMEZONE = 'Asia/Dhaka'

/** Minutes east of UTC. Bangladesh has no daylight saving, so this is constant. */
const TZ_OFFSET_MIN = 6 * 60

export const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
] as const

export type RangePreset = (typeof RANGE_PRESETS)[number]['value']

export type Granularity = 'day' | 'month'

export interface DateWindow {
  /** Inclusive lower bound. Null means "since the beginning". */
  start: Date | null
  /** Exclusive upper bound. */
  end: Date
}

/** Midnight local time, as a UTC instant. */
function startOfLocalDay(instant: Date): Date {
  const shifted = new Date(instant.getTime() + TZ_OFFSET_MIN * 60_000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - TZ_OFFSET_MIN * 60_000)
}

function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 86_400_000)
}

/** First of the month, local time, as a UTC instant. */
function startOfLocalMonth(instant: Date, monthsBack = 0): Date {
  const shifted = new Date(instant.getTime() + TZ_OFFSET_MIN * 60_000)
  shifted.setUTCDate(1)
  shifted.setUTCHours(0, 0, 0, 0)
  shifted.setUTCMonth(shifted.getUTCMonth() - monthsBack)
  return new Date(shifted.getTime() - TZ_OFFSET_MIN * 60_000)
}

/**
 * Turns a preset (or a custom from/to pair) into a concrete window.
 *
 * `end` is always tomorrow-midnight or later for open-ended presets, so an
 * order placed thirty seconds ago is inside "today" rather than just missing
 * the cut.
 */
export function resolveRange({
  range,
  from,
  to,
  now = new Date(),
}: {
  range?: string
  from?: string
  to?: string
  now?: Date
}): DateWindow {
  const today = startOfLocalDay(now)
  const tomorrow = addDays(today, 1)

  switch (range) {
    case 'today':
      return { start: today, end: tomorrow }

    case 'yesterday':
      return { start: addDays(today, -1), end: today }

    case 'last_7_days':
      // Includes today, so "last 7 days" is a week ending now rather than a
      // week ending last night.
      return { start: addDays(today, -6), end: tomorrow }

    case 'last_30_days':
      return { start: addDays(today, -29), end: tomorrow }

    case 'last_90_days':
      return { start: addDays(today, -89), end: tomorrow }

    case 'this_month':
      return { start: startOfLocalMonth(now), end: tomorrow }

    case 'last_month':
      return {
        start: startOfLocalMonth(now, 1),
        end: startOfLocalMonth(now),
      }

    case 'this_year': {
      const shifted = new Date(now.getTime() + TZ_OFFSET_MIN * 60_000)
      const yearStart = new Date(
        Date.UTC(shifted.getUTCFullYear(), 0, 1) - TZ_OFFSET_MIN * 60_000
      )
      return { start: yearStart, end: tomorrow }
    }

    case 'all_time':
      return { start: null, end: tomorrow }

    case 'custom': {
      // Both bounds are date-only strings from a form. `to` is inclusive to a
      // human — picking "31 Jan" means "through the 31st" — so the exclusive
      // end is the following midnight.
      const start = from ? startOfLocalDay(new Date(`${from}T00:00:00Z`)) : null
      const end = to
        ? addDays(startOfLocalDay(new Date(`${to}T00:00:00Z`)), 1)
        : tomorrow
      return {
        start: start && !Number.isNaN(start.getTime()) ? start : null,
        end: Number.isNaN(end.getTime()) ? tomorrow : end,
      }
    }

    default:
      return { start: addDays(today, -29), end: tomorrow }
  }
}

/**
 * The window immediately before this one, of the same length.
 *
 * What "vs. previous period" compares against. Equal length matters: comparing
 * a 30-day month against a 28-day one manufactures a 7% swing out of the
 * calendar.
 */
export function previousRange(window: DateWindow): DateWindow | null {
  // An all-time window has no "before".
  if (!window.start) return null

  const length = window.end.getTime() - window.start.getTime()
  return {
    start: new Date(window.start.getTime() - length),
    end: window.start,
  }
}

/**
 * Daily buckets up to about a quarter, monthly beyond that.
 *
 * A two-year daily chart is 730 columns of noise; a two-week monthly chart is
 * one column. The threshold is where a line chart stops being readable.
 */
export function pickGranularity(window: DateWindow): Granularity {
  if (!window.start) return 'month'
  const days = (window.end.getTime() - window.start.getTime()) / 86_400_000
  return days > 92 ? 'month' : 'day'
}

/** `2026-08-14` (day) or `2026-08` (month), in the reporting timezone. */
export function bucketKey(instant: Date, unit: Granularity): string {
  const shifted = new Date(instant.getTime() + TZ_OFFSET_MIN * 60_000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  if (unit === 'month') return `${year}-${month}`
  return `${year}-${month}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

/**
 * Every bucket key in a window, including the empty ones.
 *
 * Gaps have to be filled explicitly: a query only returns days that had orders,
 * and a chart drawn from that silently closes the gaps, turning a quiet week
 * into a straight line between two busy days.
 */
export function bucketKeys(window: DateWindow, unit: Granularity): string[] {
  if (!window.start) return []

  const keys: string[] = []
  const cursor = new Date(window.start)

  // Bounded so a corrupt window cannot spin here forever.
  for (let guard = 0; guard < 5_000 && cursor < window.end; guard += 1) {
    keys.push(bucketKey(cursor, unit))
    if (unit === 'month') {
      const shifted = new Date(cursor.getTime() + TZ_OFFSET_MIN * 60_000)
      shifted.setUTCDate(1)
      shifted.setUTCMonth(shifted.getUTCMonth() + 1)
      cursor.setTime(shifted.getTime() - TZ_OFFSET_MIN * 60_000)
    } else {
      cursor.setTime(cursor.getTime() + 86_400_000)
    }
  }

  return keys
}

/** Human label for a bucket key, for chart axes and CSV headers. */
export function formatBucketLabel(key: string, unit: Granularity): string {
  if (unit === 'month') {
    const [year, month] = key.split('-')
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, 1)
    ).toLocaleString('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  const [year, month, day] = key.split('-')
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day))
  ).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Percentage change between two periods.
 *
 * Null when the baseline is zero — "up from nothing" is not a percentage, and
 * rendering ∞% helps nobody.
 */
export function percentChange(
  current: number,
  previous: number
): number | null {
  if (!previous) return current ? null : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}
