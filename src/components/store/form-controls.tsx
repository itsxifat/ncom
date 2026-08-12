import { cn } from '@/lib/utils'

/**
 * Shared form primitives for the commerce admin.
 *
 * `FormSelect` is re-exported rather than defined here: it needs interactivity,
 * and this module is imported by server components for `Money`.
 */
export {
  FormSelect,
  type FormSelectProps,
  type FormSelectChangeEvent,
} from '@/components/ui/form-select'

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
          'border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/15 disabled:bg-muted dark:bg-input/30 h-10 w-full min-w-0 rounded-[0.875rem] border pr-3 pl-14 text-sm transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
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
