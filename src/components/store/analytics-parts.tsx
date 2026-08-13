import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The pieces the analytics page is built from.
 *
 * Two rules run through all of them, both from the chart design system:
 *
 *   Text wears text tokens, never the series colour. A coloured swatch beside a
 *   label carries the identity; the label itself stays in ink. Coloured text on
 *   a card is unreadable at small sizes and steals the emphasis the number
 *   should have.
 *
 *   Marks are thin and the chrome is recessive. The data is the loudest thing
 *   on the card; grid lines, axes and rules sit behind it.
 */

/**
 * A headline number.
 *
 * Not a chart — a single value has no shape to read, and drawing one as a
 * gauge or a donut adds ink without adding information. The comparison against
 * the previous period is the only thing that turns a number into a fact, which
 * is why it sits directly under it.
 */
export function MetricCard({
  label,
  value,
  change,
  hint,
  /** True when a *rise* is bad — cancellations, refunds. */
  invert = false,
}: {
  label: string
  value: string
  change?: number | null
  hint?: string
  invert?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-display text-xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <ChangePill change={change} invert={invert} />
          {hint && (
            <span className="text-muted-foreground text-xs">{hint}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Period-over-period movement.
 *
 * `null` means the previous period was zero. That is deliberately rendered as
 * "no comparison" rather than as an infinite rise — growth from nothing is not
 * a percentage, and "+∞%" on a dashboard is noise that trains people to ignore
 * the number beside it.
 */
function ChangePill({
  change,
  invert,
}: {
  change?: number | null
  invert: boolean
}) {
  if (change === undefined) return null

  if (change === null) {
    return (
      <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
        <Minus className="size-3" />
        no prior data
      </span>
    )
  }

  const flat = Math.abs(change) < 0.05
  const good = invert ? change < 0 : change > 0
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs tabular-nums',
        flat
          ? 'text-muted-foreground'
          : good
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-destructive'
      )}
    >
      {flat ? <Minus className="size-3" /> : <Icon className="size-3" />}
      {flat ? 'flat' : `${change > 0 ? '+' : ''}${change}%`}
      <span className="text-muted-foreground">vs prev</span>
    </span>
  )
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="font-display font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-muted-foreground text-sm text-pretty">
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export interface BarListRow {
  key: string
  label: string
  value: number
  formatted: string
  sub?: string
}

/**
 * Ranked magnitude by category.
 *
 * A horizontal bar list rather than a pie: comparing lengths against a shared
 * baseline is something people do accurately, and comparing angles is not. It
 * also gives category labels somewhere to live at full length, which a pie
 * legend never does.
 *
 * Every bar is directly labelled with its value, so the encoding is never
 * length-alone and the whole list doubles as the table view.
 */
export function BarList({
  rows,
  emptyText = 'Nothing in this period',
}: {
  rows: BarListRow[]
  emptyText?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {emptyText}
      </p>
    )
  }

  // Scaled to the largest row, not to the total: the question a ranked list
  // answers is "how do these compare to each other", and scaling to the sum
  // makes every bar in a long tail visually identical.
  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {row.formatted}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* The track is a recessive surface; only the fill carries data. */}
            <div className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%`,
                  background: 'var(--series-1)',
                }}
              />
            </div>
            {row.sub && (
              <span className="text-muted-foreground shrink-0 text-xs">
                {row.sub}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
