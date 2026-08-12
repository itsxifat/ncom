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

export function ListRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        'flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6',
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
