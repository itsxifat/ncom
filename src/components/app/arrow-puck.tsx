import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The workspace's signature affordance: a circular arrow that sits in the
 * top-right of anything you can open. It's inert markup, not a control — the
 * whole tile is the click target — so it renders as a span and reacts to the
 * `group/tile` hover on its container.
 */
export function ArrowPuck({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'text-foreground ring-foreground/12 bg-card flex size-9 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-200',
        'group-hover/tile:bg-lime group-hover/tile:text-lime-foreground group-hover/tile:ring-lime',
        'group-focus-visible/tile:bg-lime group-focus-visible/tile:ring-lime',
        className
      )}
    >
      <ArrowUpRight className="size-4 transition-transform duration-200 group-hover/tile:translate-x-px group-hover/tile:-translate-y-px" />
    </span>
  )
}
