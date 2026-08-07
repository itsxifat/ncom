import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ordered back-to-front. Each card cascades further down-right than the
// last, so only a blank margin (never label text) peeks out from behind.
const CARDS = [
  {
    label: 'Navbar',
    dot: 'bg-muted-foreground/40',
    rotate: '-rotate-6',
    translate: 'translate-x-20 translate-y-20',
    lines: ['w-10', 'w-6'],
  },
  {
    label: 'CTA',
    dot: 'bg-amber',
    rotate: 'rotate-5',
    translate: 'translate-x-13 translate-y-13',
    lines: ['w-16', 'w-10'],
  },
  {
    label: 'Features',
    dot: 'bg-primary/50',
    rotate: '-rotate-3',
    translate: 'translate-x-6 translate-y-6',
    lines: ['w-20', 'w-14', 'w-16'],
  },
  {
    label: 'Hero',
    dot: 'bg-primary',
    rotate: 'rotate-0',
    translate: '',
    lines: ['w-24', 'w-16'],
  },
] as const

export function SectionStack() {
  return (
    <div
      aria-hidden
      className="relative mx-auto h-80 w-full max-w-xs sm:h-96 sm:max-w-sm"
    >
      {CARDS.map((card, i) => (
        <div
          key={card.label}
          style={{ zIndex: i + 1 }}
          className={cn(
            'bg-card border-border absolute top-8 left-8 w-48 rounded-xl border p-4 shadow-[0_8px_30px_-12px_rgb(0_0_0_/_0.25)] sm:w-56',
            card.rotate,
            card.translate
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', card.dot)} />
              <span className="text-muted-foreground text-[0.65rem] font-medium tracking-wide uppercase">
                {card.label}
              </span>
            </div>
            <GripVertical className="text-muted-foreground/40 size-3.5" />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {card.lines.map((w, i) => (
              <span key={i} className={cn('bg-muted h-1.5 rounded-full', w)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
