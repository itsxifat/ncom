import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// The mobile size is the real design here, not a shrunken desktop one: at
// two-up on a 390px screen a stat tile is ~180px wide, so the padding, the
// gap and the numeral all step down together. Stacking these full-width
// instead would push the first actual content on the page below the fold.
const statCardVariants = cva(
  'relative flex min-h-24 flex-col justify-between gap-3 overflow-hidden rounded-xl p-4 sm:min-h-28 sm:gap-4 sm:p-5',
  {
    variants: {
      tone: {
        default: 'bg-card text-card-foreground ring-border ring-1',
        ink: 'bg-ink text-ink-foreground',
        lime: 'bg-lime text-lime-foreground',
      },
    },
    defaultVariants: { tone: 'default' },
  }
)

interface StatCardProps extends VariantProps<typeof statCardVariants> {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <div className={cn(statCardVariants({ tone }), className)}>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'eyebrow',
            tone === 'default' ? 'text-muted-foreground' : 'opacity-60'
          )}
        >
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full sm:size-8 [&_svg]:size-3.5 sm:[&_svg]:size-4',
              tone === 'ink' ? 'bg-white/10' : 'bg-black/6 dark:bg-white/10'
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div>
        <p
          data-slot="stat-value"
          className="font-display text-2xl leading-none font-semibold tracking-tight sm:text-[1.875rem]"
        >
          {value}
        </p>
        {hint && (
          <p
            className={cn(
              'mt-2 text-xs',
              tone === 'default' ? 'text-muted-foreground' : 'opacity-70'
            )}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
