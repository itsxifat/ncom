'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { RANGE_PRESETS } from '@/lib/date-range'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Date range control.
 *
 * The range lives in the URL rather than in component state, so a merchant can
 * bookmark "last month" and send the link to their accountant, and so the CSV
 * export button can point at exactly the window on screen without a second
 * source of truth.
 *
 * Presets sit in one row above the charts. The custom range only unfolds when
 * it is chosen — two date inputs permanently occupying the bar is clutter for
 * the nine times in ten a preset is what was wanted.
 */
export function AnalyticsFilterBar({
  range,
  from,
  to,
}: {
  range: string
  from: string
  to: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)

  const go = (next: Record<string, string | null>) => {
    const query = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value)
      else query.delete(key)
    }
    router.push(`/analytics?${query.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            size="sm"
            variant={range === preset.value ? 'default' : 'outline'}
            onClick={() =>
              preset.value === 'custom'
                ? go({ range: 'custom' })
                : go({ range: preset.value, from: null, to: null })
            }
            className={cn(range === preset.value && 'pointer-events-none')}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">From</span>
            <Input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">To</span>
            <Input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="w-40"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!customFrom || !customTo}
            onClick={() =>
              go({ range: 'custom', from: customFrom, to: customTo })
            }
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
