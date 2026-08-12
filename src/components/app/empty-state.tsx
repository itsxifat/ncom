import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * An empty screen is an invitation, so every one of these carries an action
 * where an action exists. The lime disc is the only decoration allowed.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-card ring-foreground/6 shadow-puck flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center ring-1',
        className
      )}
    >
      <span className="bg-lime text-lime-foreground flex size-12 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="font-display text-lg font-semibold tracking-tight">
          {title}
        </p>
        {description && (
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm text-pretty">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
