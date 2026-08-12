import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const statCardVariants = cva(
  'shadow-puck relative flex min-h-32 flex-col justify-between gap-6 overflow-hidden rounded-xl p-5 2xl:min-h-36 2xl:p-6',
  {
    variants: {
      tone: {
        default: 'bg-card text-card-foreground ring-foreground/6 ring-1',
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
              'flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
              tone === 'ink' ? 'bg-white/10' : 'bg-black/6'
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div>
        <p
          data-slot="stat-value"
          className="font-display text-4xl leading-none font-semibold tracking-tight 2xl:text-5xl"
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
