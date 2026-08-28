'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TabItem {
  href: string
  label: string
  icon: LucideIcon
  /** Match this route only when the path is exactly it. */
  exact?: boolean
}

/**
 * Primary navigation on a phone.
 *
 * The desktop rail is a black panel floating on the canvas; this is the same
 * object rotated onto the bottom edge, and it is deliberately the same black in
 * both themes for the same reason the rail is — the thing you navigate by
 * should not change colour under you. Active still reads as a lime pill,
 * because that is the "you are here" mark the rail already taught.
 *
 * It exists at all because a hamburger is the wrong default for a workspace
 * someone checks on their phone between other things. Opening a drawer, reading
 * a list of twenty destinations and picking one is three deliberate acts; the
 * four things a merchant actually does on a phone — see the day, work the order
 * book, scan a parcel, check a product — should each be one thumb-tap from
 * anywhere. Everything else stays in the drawer behind `More`, which is the
 * fifth slot rather than a separate control, so the bar covers the whole
 * navigation surface and not just its favourites.
 *
 * It sits at the bottom because that is where thumbs are. A top bar on a
 * 6.7-inch phone is a two-handed control.
 */
export function MobileTabBar({
  items,
  onMore,
  moreActive,
}: {
  /** Four, at most: a fifth destination makes every target too narrow to hit. */
  items: TabItem[]
  onMore: () => void
  moreActive?: boolean
}) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      // `pb-safe` rather than a fixed offset: the home-indicator strip is 34pt
      // on some phones, 0 on others and 0 in every desktop browser, and a
      // hard-coded gap is wrong on all three.
      className="bg-sidebar text-sidebar-foreground shadow-lift pb-safe fixed inset-x-3 bottom-3 z-40 flex items-stretch gap-1 rounded-3xl p-1.5 lg:hidden"
    >
      {items.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 transition-colors',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-ink-muted active:bg-white/10'
            )}
          >
            <Icon className="size-5 shrink-0" />
            {/* The label is small but it is not optional: an icon-only bar is a
                memory test, and "Scan" and "Labels" are not distinguishable
                glyphs to someone using this for the first time. */}
            <span className="max-w-full truncate text-[0.625rem] leading-none font-medium">
              {item.label}
            </span>
          </Link>
        )
      })}

      <button
        type="button"
        onClick={onMore}
        aria-haspopup="dialog"
        aria-label="More destinations"
        className={cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 transition-colors',
          moreActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-ink-muted active:bg-white/10'
        )}
      >
        <MoreHorizontal className="size-5 shrink-0" />
        <span className="text-[0.625rem] leading-none font-medium">More</span>
      </button>
    </nav>
  )
}
