'use client'

import { useId, useMemo, useState } from 'react'
import { Table2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBucketLabel, type Granularity } from '@/lib/date-range'

export interface TrendPoint {
  key: string
  orders: number
  netSalesCents: number
  collectedCents: number
  cancelled: number
}

/**
 * Money over time.
 *
 * Two series on one axis, both in the same unit. That is not an accident of
 * layout — a second y-axis is the single most misleading thing a chart can do,
 * because the crossing point where one line "overtakes" the other is invented
 * by whoever picked the scales. Invoiced and collected are both money, so they
 * share a scale honestly, and the gap between them is the number the merchant
 * actually wants: what has been promised but not yet received.
 *
 * Order counts are deliberately *not* plotted here. They are a different unit,
 * and putting them on this chart would require exactly the dual axis above.
 * They get their own row of bars underneath, sharing the x positions.
 *
 * The palette is the validated two-slot categorical pair, defined for both
 * themes on the wrapper. Light-mode aqua sits just under 3:1 against white, so
 * the design system requires relief — supplied here by the always-present
 * legend, the direct end-labels, and the table view toggle.
 */
export function AnalyticsTrend({
  series,
  granularity,
  formatMoney,
}: {
  series: TrendPoint[]
  granularity: Granularity
  /** Cents -> display string, in the store's currency. */
  formatMoney: (cents: number) => string
}) {
  const gradientId = useId()
  const [showTable, setShowTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const width = 760
    const height = 220
    const padding = { top: 16, right: 12, bottom: 22, left: 12 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const peak = Math.max(
      ...series.map((point) =>
        Math.max(point.netSalesCents, point.collectedCents)
      ),
      1
    )

    // A single point has no line to draw; centre it so the marker is visible.
    const step = series.length > 1 ? plotWidth / (series.length - 1) : 0
    const x = (index: number) =>
      series.length > 1
        ? padding.left + index * step
        : padding.left + plotWidth / 2
    const y = (cents: number) =>
      padding.top + plotHeight - (cents / peak) * plotHeight

    const path = (pick: (point: TrendPoint) => number) =>
      series
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(pick(point)).toFixed(2)}`
        )
        .join(' ')

    const area = `${path((point) => point.netSalesCents)} L ${x(series.length - 1).toFixed(2)} ${(padding.top + plotHeight).toFixed(2)} L ${x(0).toFixed(2)} ${(padding.top + plotHeight).toFixed(2)} Z`

    return {
      width,
      height,
      padding,
      plotWidth,
      plotHeight,
      peak,
      x,
      y,
      path,
      area,
    }
  }, [series])

  const totals = useMemo(
    () => ({
      net: series.reduce((sum, point) => sum + point.netSalesCents, 0),
      collected: series.reduce((sum, point) => sum + point.collectedCents, 0),
      orders: series.reduce((sum, point) => sum + point.orders, 0),
    }),
    [series]
  )

  const maxOrders = Math.max(...series.map((point) => point.orders), 1)
  const active = hover != null ? series[hover] : null

  if (series.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        No orders in this period.
      </p>
    )
  }

  return (
    <div
      className="flex flex-col gap-4"
      style={
        {
          // Validated categorical slots 1 and 3, light and dark. Defined here
          // rather than in globals.css so the chart carries its own contract:
          // the brand's own --chart-* tokens are a marketing palette and fail
          // the colour-blind separation and contrast checks as chart series.
          '--series-1': 'light-dark(#2a78d6, #3987e5)',
          '--series-2': 'light-dark(#1baf7a, #199e70)',
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* A legend is always present for two or more series, so identity is
            never carried by colour alone. */}
        <ul className="flex flex-wrap items-center gap-4 text-sm">
          <LegendItem
            color="var(--series-1)"
            label="Invoiced"
            value={formatMoney(totals.net)}
          />
          <LegendItem
            color="var(--series-2)"
            label="Collected"
            value={formatMoney(totals.collected)}
          />
        </ul>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowTable((current) => !current)}
        >
          {showTable ? <TrendingUp /> : <Table2 />}
          {showTable ? 'Chart' : 'Table'}
        </Button>
      </div>

      {showTable ? (
        <TrendTable
          series={series}
          granularity={granularity}
          formatMoney={formatMoney}
        />
      ) : (
        <>
          <div className="relative">
            <svg
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              className="w-full"
              style={{ height: 220 }}
              role="img"
              aria-label={`Invoiced and collected sales by ${granularity}`}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--series-1)"
                    stopOpacity="0.18"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--series-1)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>

              {/* Recessive grid: four rules, no axis box, no tick labels
                  cluttering the plot — the numbers live in the legend and the
                  tooltip, where they are exact rather than estimated. */}
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <line
                  key={fraction}
                  x1={geometry.padding.left}
                  x2={geometry.width - geometry.padding.right}
                  y1={geometry.padding.top + geometry.plotHeight * fraction}
                  y2={geometry.padding.top + geometry.plotHeight * fraction}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-border"
                  opacity={fraction === 1 ? 0.9 : 0.4}
                />
              ))}

              <path d={geometry.area} fill={`url(#${gradientId})`} />

              <path
                d={geometry.path((point) => point.netSalesCents)}
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={geometry.path((point) => point.collectedCents)}
                fill="none"
                stroke="var(--series-2)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Crosshair for the hovered bucket. */}
              {hover != null && (
                <line
                  x1={geometry.x(hover)}
                  x2={geometry.x(hover)}
                  y1={geometry.padding.top}
                  y2={geometry.padding.top + geometry.plotHeight}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-muted-foreground"
                  opacity="0.5"
                />
              )}

              {hover != null && active && (
                <>
                  {/* 2px surface ring so a marker sitting on the line stays
                      legible where the two series overlap. */}
                  <Marker
                    cx={geometry.x(hover)}
                    cy={geometry.y(active.netSalesCents)}
                    color="var(--series-1)"
                  />
                  <Marker
                    cx={geometry.x(hover)}
                    cy={geometry.y(active.collectedCents)}
                    color="var(--series-2)"
                  />
                </>
              )}

              {/* Hit targets: full-height columns, far bigger than the marks,
                  so hovering does not require pixel accuracy on a 2px line. */}
              {series.map((point, index) => (
                <rect
                  key={point.key}
                  x={
                    geometry.x(index) -
                    geometry.plotWidth / Math.max(series.length, 1) / 2
                  }
                  y={geometry.padding.top}
                  width={geometry.plotWidth / Math.max(series.length, 1)}
                  height={geometry.plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHover(index)}
                />
              ))}
            </svg>

            {active && (
              <Tooltip
                point={active}
                index={hover!}
                count={series.length}
                granularity={granularity}
                formatMoney={formatMoney}
              />
            )}
          </div>

          {/* Orders share the x positions but not the y scale — a separate row
              rather than a second axis on the chart above. */}
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs">
              Orders placed ({totals.orders.toLocaleString()})
            </p>
            <div className="flex h-8 items-end gap-px">
              {series.map((point, index) => (
                <div
                  key={point.key}
                  className="min-w-0 flex-1 rounded-t-[2px] transition-opacity"
                  style={{
                    height: `${Math.max((point.orders / maxOrders) * 100, point.orders > 0 ? 6 : 0)}%`,
                    background:
                      hover === index
                        ? 'var(--series-1)'
                        : 'color-mix(in oklab, var(--series-1) 45%, transparent)',
                  }}
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  title={`${formatBucketLabel(point.key, granularity)}: ${point.orders} orders`}
                />
              ))}
            </div>
          </div>

          <div className="text-muted-foreground flex justify-between text-xs">
            <span>{formatBucketLabel(series[0]!.key, granularity)}</span>
            <span>
              {formatBucketLabel(series[series.length - 1]!.key, granularity)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Marker({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="6" className="fill-card" />
      <circle cx={cx} cy={cy} r="4.5" fill={color} />
    </>
  )
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {/* Label and value stay in ink; the swatch carries the identity. */}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </li>
  )
}

function Tooltip({
  point,
  index,
  count,
  granularity,
  formatMoney,
}: {
  point: TrendPoint
  index: number
  count: number
  granularity: Granularity
  formatMoney: (cents: number) => string
}) {
  // Flips to the left of the crosshair past halfway, so it never runs off the
  // card on the last few buckets.
  const pastHalfway = count > 1 && index / (count - 1) > 0.55

  return (
    <div
      className="bg-card pointer-events-none absolute top-2 rounded-lg border p-2.5 text-xs shadow-md"
      style={pastHalfway ? { left: '2%' } : { right: '2%' }}
    >
      <p className="font-medium">{formatBucketLabel(point.key, granularity)}</p>
      <dl className="mt-1.5 flex flex-col gap-1">
        <TooltipRow
          color="var(--series-1)"
          label="Invoiced"
          value={formatMoney(point.netSalesCents)}
        />
        <TooltipRow
          color="var(--series-2)"
          label="Collected"
          value={formatMoney(point.collectedCents)}
        />
        <div className="text-muted-foreground flex justify-between gap-4 pt-0.5">
          <dt>Orders</dt>
          <dd className="tabular-nums">
            {point.orders}
            {point.cancelled > 0 && ` · ${point.cancelled} cancelled`}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground flex items-center gap-1.5">
        <span
          className="size-2 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

/** The same data as a table — the accessible view, and the contrast relief. */
function TrendTable({
  series,
  granularity,
  formatMoney,
}: {
  series: TrendPoint[]
  granularity: Granularity
  formatMoney: (cents: number) => string
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            {['Period', 'Orders', 'Invoiced', 'Collected'].map(
              (head, index) => (
                <th
                  key={head}
                  className={`px-3 py-2 font-medium ${index ? 'text-right' : 'text-left'}`}
                >
                  {head}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.key} className="border-t">
              <td className="px-3 py-1.5">
                {formatBucketLabel(point.key, granularity)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {point.orders}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatMoney(point.netSalesCents)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatMoney(point.collectedCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
