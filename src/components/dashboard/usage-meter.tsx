import { cn } from '@/lib/utils'
import {
  QUOTA_META,
  formatQuota,
  formatUsage,
  quotaFraction,
  type QuotaKey,
} from '@/lib/plans'

/**
 * One quota, as a bar.
 *
 * The colour changes at 75% and again at 100% because the number alone does not
 * communicate urgency — someone at 4.9 GB of 5 GB needs to notice before the
 * upload that fails, not after.
 *
 * An unlimited quota renders the figure with no bar at all. A full-width bar
 * against no ceiling would read as "you are at your limit", which is the opposite
 * of what unlimited means.
 */
export function UsageMeter({
  quota,
  used,
  limit,
  note,
}: {
  quota: QuotaKey
  used: number
  limit: number | null
  note?: string | null
}) {
  const meta = QUOTA_META[quota]
  const fraction = quotaFraction(limit, used)
  const percent = Math.round(fraction * 100)
  const isFull = limit !== null && used >= limit
  const isNearFull = !isFull && fraction >= 0.75

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{meta.label}</span>
        <span
          className={cn(
            'font-mono text-xs',
            isFull
              ? 'text-destructive'
              : isNearFull
                ? 'text-amber-600 dark:text-amber-500'
                : 'text-muted-foreground'
          )}
        >
          {formatUsage(used, meta.unit)}
          {limit !== null && ` / ${formatQuota(limit, meta.unit)}`}
        </span>
      </div>

      {limit === null ? (
        <p className="text-muted-foreground text-xs">
          Unlimited{note ? ` — ${note}` : ''}
        </p>
      ) : (
        <>
          <div
            className="bg-muted h-1.5 overflow-hidden rounded-full"
            role="meter"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${meta.label}: ${percent}% used`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isFull
                  ? 'bg-destructive'
                  : isNearFull
                    ? 'bg-amber-500'
                    : 'bg-primary'
              )}
              style={{
                width: `${Math.max(fraction * 100, used > 0 ? 2 : 0)}%`,
              }}
            />
          </div>
          {(isFull || isNearFull) && (
            <p
              className={cn(
                'text-xs',
                isFull
                  ? 'text-destructive'
                  : 'text-amber-600 dark:text-amber-500'
              )}
            >
              {isFull ? meta.exceededHint : `${percent}% used.`}
              {meta.resets && isFull && ' Resets at the start of next month.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
