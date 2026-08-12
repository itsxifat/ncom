import { cn } from '@/lib/utils'

/**
 * Shared form primitives for the commerce admin.
 *
 * A native <select> rather than the Base UI one, matching the theme form: it
 * posts with FormData without a hidden-input bridge, works before hydration,
 * and gets the platform's own picker on mobile. The commerce admin is
 * data-entry-heavy, so that reliability matters more than a styled listbox.
 */
export function FormSelect({
  className,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-input bg-card h-10 rounded-[0.875rem] border px-3 text-sm',
        className
      )}
      {...props}
    />
  )
}

/**
 * Money input. The currency sits inside the field rather than in the label so
 * it stays visible while typing, and `inputMode="decimal"` gets the numeric
 * keypad on mobile without rejecting a pasted "1,299.00".
 */
export function MoneyInput({
  currencyCode,
  className,
  ...props
}: React.ComponentProps<'input'> & { currencyCode: string }) {
  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
        {currencyCode}
      </span>
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          'border-input bg-card h-10 w-full rounded-[0.875rem] border pr-3 pl-14 text-sm',
          className
        )}
        {...props}
      />
    </div>
  )
}

/** Right-aligned monospace figure, so columns of money line up on the decimal. */
export function Money({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('font-mono text-sm tabular-nums', className)}>
      {children}
    </span>
  )
}
