'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface SectionTab {
  href: string
  label: string
  /**
   * Whether pages below `href` still belong to this tab — a product's own page
   * under "All products", a discount's under "Discounts". Off by default, so a
   * tab whose href is a prefix of a sibling's (`/stores/x` and
   * `/stores/x/pages`) does not light up for both.
   */
  nested?: boolean
  /** A count worth reading before clicking, e.g. how many items run low. */
  badge?: React.ReactNode
}

/**
 * Route-level tabs: the pages of one section, with a line under the one you
 * are on.
 *
 * This is how the rail stays short. Things that are one job split across
 * several screens — products, categories, collections and stock are all "what
 * I sell" — get one entry in the rail and a row of these at the top, rather
 * than four entries a new merchant has to tell apart before they have used
 * any of them.
 *
 * When more than one tab matches, the longest href wins, so `/discounts/offers`
 * is Offers even though it also sits under `/discounts`.
 */
export function SectionTabs({
  items,
  label,
  className,
}: {
  items: SectionTab[]
  /** What the row is, for screen readers: "Products", "Store". */
  label: string
  className?: string
}) {
  const pathname = usePathname()

  const active = items
    .filter(
      (item) =>
        pathname === item.href ||
        (item.nested && pathname.startsWith(`${item.href}/`))
    )
    .sort((a, b) => b.href.length - a.href.length)[0]

  return (
    <nav
      aria-label={label}
      className={cn(
        'border-border flex scrollbar-none items-end gap-1 overflow-x-auto border-b',
        className
      )}
    >
      {items.map((item) => {
        const isActive = item === active

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
              isActive
                ? 'border-foreground text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground border-transparent font-medium'
            )}
          >
            {item.label}
            {item.badge}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * The count beside a tab label. Ink on the active tab is too much ceremony for
 * a number, so it is always the quiet chip; `tone="attention"` is for a number
 * that means something needs doing.
 */
export function TabCount({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'attention'
}) {
  return (
    <span
      className={cn(
        'min-w-6 rounded-full px-2 text-center text-xs leading-5 font-semibold tabular-nums',
        tone === 'attention'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}
