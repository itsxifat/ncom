import { cn } from '@/lib/utils'

/**
 * The workspace's table stand-in: one white panel, hairline-separated rows.
 * It stays a stack of flex rows rather than a real table because every list in
 * the app is "label + meta on the left, controls on the right" — and that
 * collapses onto mobile without any column bookkeeping.
 */
export function ListPanel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-panel"
      className={cn(
        'bg-card ring-foreground/6 shadow-puck divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl ring-1',
        className
      )}
      {...props}
    />
  )
}

export function ListPanelHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-panel-header"
      className={cn(
        'flex items-center justify-between gap-4 px-5 py-4 sm:px-6',
        className
      )}
      {...props}
    />
  )
}

/**
 * One row.
 *
 * `interactive` makes the whole row a click target for the link inside it: the
 * row becomes the positioning context, and the link stretches a transparent
 * pseudo-element across it with `after:absolute after:inset-0`. It is done that
 * way — rather than wrapping the row in an anchor or hanging an onClick off the
 * div — because the link stays a real link: it is reachable by keyboard, it
 * opens in a new tab on middle click, and screen readers announce the row's
 * title rather than the whole row's text as the destination.
 *
 * Anything else in the row that has to stay clickable needs its own stacking
 * context (`relative z-10`) to sit above that overlay.
 */
export function ListRow({
  className,
  interactive,
  ...props
}: React.ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        'relative flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6',
        interactive && 'hover:bg-muted/50 focus-within:bg-muted/50',
        className
      )}
      {...props}
    />
  )
}

/** Left half of a row: a title line plus a muted meta line under it. */
export function ListRowText({
  title,
  meta,
  badges,
  className,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  badges?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate font-medium">{title}</span>
        {badges}
      </div>
      {meta && (
        <p className="text-muted-foreground mt-1 truncate text-sm">{meta}</p>
      )}
    </div>
  )
}

/** Right half of a row: controls, kept from wrapping under their own labels. */
export function ListRowActions({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-row-actions"
      className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}
      {...props}
    />
  )
}
