'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CountdownContent } from './content'

/**
 * The ticking half of the countdown block.
 *
 * Starts at null and fills in on mount: the server has no idea what "now" is
 * for this visitor, and rendering a time on the server guarantees a hydration
 * mismatch (and a stale first paint). The dashes shown for that first frame are
 * deliberate — they are what both sides agree on.
 *
 * It also owns the evergreen deadline, which is per-visitor by definition and
 * therefore cannot exist until the browser does.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Where one visitor's evergreen deadline lives, scoped to this one block. */
function evergreenKey(sectionId: string) {
  return `ncom:countdown:${sectionId}`
}

/**
 * The deadline for an evergreen timer: created on the visitor's first view and
 * kept afterwards.
 *
 * Persisting it is the honest behaviour. A timer that restarts at fifteen
 * minutes on every refresh is a lie the buyer can catch in one keystroke, and a
 * countdown nobody believes sells nothing. localStorage can throw outright
 * (private windows, storage disabled by policy), so every access is guarded and
 * the fallback is a session-only timer rather than a broken block.
 */
function resolveEvergreenDeadline(
  sectionId: string,
  durationMs: number
): number {
  const now = Date.now()
  const fresh = now + durationMs
  if (!sectionId) return fresh

  try {
    const stored = Number(window.localStorage.getItem(evergreenKey(sectionId)))
    if (Number.isFinite(stored) && stored > 0) {
      // A past deadline is kept, not reset: this visitor's window really has
      // closed, and handing them a fresh one on refresh is the same lie.
      if (stored <= now) return stored
      // A deadline further out than the configured duration means the merchant
      // has since shortened the timer — honour the newer, shorter promise.
      if (stored <= fresh) return stored
    }
    window.localStorage.setItem(evergreenKey(sectionId), String(fresh))
  } catch {
    // Storage unavailable — fall through to a session-only timer.
  }
  return fresh
}

interface Part {
  label: string
  value: number
}

/**
 * Splits a duration into the units this block is configured to show.
 *
 * Whatever is dropped rolls up into the largest unit that is kept, so the
 * numbers still add up to the real remaining time — an "hours, minutes,
 * seconds" timer on a three-day sale reads 72 hours, not 0.
 */
function splitParts(ms: number, units: CountdownContent['units']): Part[] {
  const total = Math.max(0, ms)
  const days = Math.floor(total / DAY)

  // 'auto' is the sane default: a two-week sale needs a days column, and a
  // twenty-minute flash sale looks absurd with one reading 00.
  const showDays = units === 'dhms' || (units === 'auto' && days > 0)
  const showHours = units !== 'ms'

  const parts: Part[] = []
  let rest = total

  if (showDays) {
    parts.push({ label: 'Days', value: days })
    rest -= days * DAY
  }
  if (showHours) {
    const hours = Math.floor(rest / HOUR)
    parts.push({ label: 'Hours', value: hours })
    rest -= hours * HOUR
  }

  const minutes = Math.floor(rest / MINUTE)
  parts.push({ label: 'Mins', value: minutes })
  rest -= minutes * MINUTE

  parts.push({ label: 'Secs', value: Math.floor(rest / SECOND) })
  return parts
}

const DIGIT_SIZE: Record<CountdownContent['size'], string> = {
  small: 'text-xl sm:text-2xl',
  medium: 'text-2xl sm:text-3xl',
  large: 'text-4xl sm:text-5xl',
}

const BOX_SIZE: Record<CountdownContent['size'], string> = {
  small: 'min-w-[52px] px-2 py-2 sm:min-w-[62px]',
  medium: 'min-w-[62px] px-2 py-3 sm:min-w-[76px]',
  large: 'min-w-[78px] px-3 py-4 sm:min-w-[96px]',
}

const GAP: Record<CountdownContent['size'], string> = {
  small: 'gap-2 sm:gap-3',
  medium: 'gap-3 sm:gap-5',
  large: 'gap-3 sm:gap-6',
}

/**
 * The plain-digits style spaces itself with its own colons, so the row gap has
 * to collapse — a gap *and* a colon puts all the air on one side of it and the
 * clock reads as "14: 55".
 */
const MINIMAL_GAP = 'gap-0'

const JUSTIFY: Record<CountdownContent['align'], string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

export function CountdownClock({
  target,
  content,
  sectionId,
  onPanel,
  editing,
  onExpiredChange,
}: {
  /** Fixed deadline as an epoch, or null when the block runs evergreen. */
  target: number | null
  content: CountdownContent
  sectionId: string
  /** True when the digits sit on the accent panel and must paint light. */
  onPanel: boolean
  editing: boolean
  /** Lets the wrapper hide itself once the timer runs out. */
  onExpiredChange?: (expired: boolean) => void
}) {
  const durationMs = Math.max(1, content.durationMinutes) * MINUTE
  const evergreen = content.mode === 'evergreen'

  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    // Resolved inside the effect rather than held as state: an evergreen
    // deadline comes out of localStorage, which does not exist on the server,
    // and a fixed one is already a prop. Neither is worth a second render pass.
    //
    // In the builder the evergreen deadline is recomputed from the current
    // settings instead of read from storage — the merchant is adjusting the
    // window length and needs to see it move, not see the deadline this browser
    // happened to save the first time the canvas loaded.
    const deadline = evergreen
      ? editing
        ? Date.now() + durationMs
        : resolveEvergreenDeadline(sectionId, durationMs)
      : target
    if (deadline === null) return

    const tick = () => setLeft(Math.max(0, deadline - Date.now()))
    tick()
    const id = setInterval(tick, SECOND)
    return () => clearInterval(id)
  }, [evergreen, target, durationMs, sectionId, editing])

  const expired = left !== null && left <= 0

  useEffect(() => {
    onExpiredChange?.(expired)
  }, [expired, onExpiredChange])

  const parts = useMemo(
    () => splitParts(left ?? 0, content.units),
    [left, content.units]
  )

  const urgent =
    content.urgentAtMinutes > 0 &&
    left !== null &&
    left > 0 &&
    left <= content.urgentAtMinutes * MINUTE

  const digitTone = onPanel ? 'text-white' : 'text-[color:var(--lp-text)]'
  const labelTone = onPanel ? 'text-white/70' : 'text-[color:var(--lp-text)]/55'

  if (expired && content.onExpire === 'message') {
    return (
      <p className={cn('text-lg font-semibold', digitTone)}>
        {content.expiredText || 'This offer has ended.'}
      </p>
    )
  }

  const boxed = content.style === 'boxes'
  const minimal = content.style === 'minimal'

  return (
    <div
      role="timer"
      // The clock repaints every second; announcing that would make a screen
      // reader unusable. The deadline itself is in the label instead.
      aria-live="off"
      className={cn(
        'flex flex-wrap',
        minimal ? MINIMAL_GAP : GAP[content.size],
        JUSTIFY[content.align],
        minimal && 'items-end',
        urgent && 'animate-pulse'
      )}
    >
      {parts.map((part, index) => (
        <div
          key={part.label}
          className={cn(
            'text-center',
            boxed &&
              cn(
                'rounded-xl',
                BOX_SIZE[content.size],
                onPanel
                  ? 'bg-white/15 backdrop-blur'
                  : 'bg-[color-mix(in_oklab,currentColor_8%,transparent)]'
              ),
            content.style === 'pill' &&
              cn(
                'rounded-full border',
                BOX_SIZE[content.size],
                onPanel ? 'border-white/35' : 'border-current/20'
              )
          )}
        >
          <p
            className={cn(
              'font-bold tabular-nums',
              DIGIT_SIZE[content.size],
              urgent ? 'text-[color:var(--lp-countdown-urgent)]' : digitTone
            )}
          >
            {left === null ? '--' : pad(part.value)}
            {/* In the minimal style there are no boxes to imply the grouping,
                so the colon has to do that work. */}
            {minimal && index < parts.length - 1 && (
              <span className={cn('px-1.5 font-normal sm:px-2', labelTone)}>
                :
              </span>
            )}
          </p>
          {content.showLabels && (
            <p
              className={cn(
                'mt-1 tracking-[2px] uppercase',
                content.size === 'large' ? 'text-[10px]' : 'text-[9px]',
                labelTone
              )}
            >
              {part.label}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
