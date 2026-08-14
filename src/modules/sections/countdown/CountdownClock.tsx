'use client'

import { useEffect, useState } from 'react'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * The ticking half of the countdown block.
 *
 * Starts at null and fills in on mount: the server has no idea what "now" is
 * for this visitor, and rendering a time on the server guarantees a hydration
 * mismatch (and a stale first paint). The dashes shown for that first frame are
 * deliberate — they are what both sides agree on.
 */
export function CountdownClock({
  target,
  expiredText,
}: {
  target: number
  expiredText: string
}) {
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!target) return
    const tick = () => setLeft(Math.max(0, target - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  const expired = left !== null && left <= 0
  if (expired) {
    return (
      <p className="text-lg font-semibold text-white">
        {expiredText || 'This offer has ended.'}
      </p>
    )
  }

  const s = Math.floor((left ?? 0) / 1000)
  const parts = [
    { label: 'Days', value: Math.floor(s / 86400) },
    { label: 'Hours', value: Math.floor((s % 86400) / 3600) },
    { label: 'Mins', value: Math.floor((s % 3600) / 60) },
    { label: 'Secs', value: s % 60 },
  ]

  return (
    <div className="flex justify-center gap-3 sm:gap-5">
      {parts.map((p) => (
        <div
          key={p.label}
          className="min-w-[62px] rounded-xl bg-white/15 px-2 py-3 backdrop-blur sm:min-w-[76px]"
        >
          <p className="text-2xl font-bold text-white tabular-nums sm:text-3xl">
            {left === null ? '--' : pad(p.value)}
          </p>
          <p className="mt-1 text-[9px] tracking-[2px] text-white/70 uppercase">
            {p.label}
          </p>
        </div>
      ))}
    </div>
  )
}
