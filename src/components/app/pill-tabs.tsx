'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Route-level tabs. A track of pills with an ink marker on the current one —
 * the same "you are here" language the nav rail uses, one level down.
 */
export function PillTabs({
  items,
  className,
}: {
  items: { href: string; label: string }[]
  className?: string
}) {
  const pathname = usePathname()

  return (
    <nav
      className={cn(
        'bg-card ring-foreground/6 shadow-puck inline-flex w-fit max-w-full scrollbar-none items-center gap-1 overflow-x-auto rounded-full p-1 ring-1',
        className
      )}
    >
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-ink text-ink-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
