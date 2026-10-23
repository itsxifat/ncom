'use client'

import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  ChartColumn,
  House,
  Images,
  Layers,
  Package,
  PanelsTopLeft,
  Plus,
  Printer,
  ScanLine,
  Search,
  ShieldAlert,
  ShoppingBag,
  Tag,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SETTINGS_GROUPS } from '@/components/dashboard/settings-entries'
import { cn } from '@/lib/utils'

interface Destination {
  href: string
  label: string
  /** Which section it sits in, shown beside the label. */
  section: string
  icon: LucideIcon
  keywords?: string[]
}

/**
 * Every place worth jumping to, including the ones that are tabs or settings
 * rather than rail entries — the rail got shorter by moving things one level
 * down, and this is how someone who remembers "labels" still gets there in one
 * step.
 */
const DESTINATIONS: Destination[] = [
  { href: '/dashboard', label: 'Home', section: 'Workspace', icon: House },
  { href: '/orders', label: 'Orders', section: 'Orders', icon: ShoppingBag },
  {
    href: '/orders?delivery=FRAUD_REVIEW',
    label: 'Orders to review',
    section: 'Orders',
    icon: ShieldAlert,
    keywords: ['fraud', 'risky', 'held'],
  },
  {
    href: '/labels',
    label: 'Print labels',
    section: 'Orders',
    icon: Printer,
    keywords: ['sticker', 'packing'],
  },
  {
    href: '/scan',
    label: 'Scan parcels',
    section: 'Orders',
    icon: ScanLine,
    keywords: ['barcode', 'dispatch'],
  },
  { href: '/products', label: 'Products', section: 'Products', icon: Package },
  {
    href: '/products/new',
    label: 'Add a product',
    section: 'Products',
    icon: Plus,
  },
  {
    href: '/categories',
    label: 'Categories',
    section: 'Products',
    icon: Layers,
  },
  {
    href: '/collections',
    label: 'Collections',
    section: 'Products',
    icon: Layers,
  },
  {
    href: '/inventory',
    label: 'Stock',
    section: 'Products',
    icon: Warehouse,
    keywords: ['inventory', 'quantity'],
  },
  { href: '/customers', label: 'Customers', section: 'Customers', icon: Users },
  { href: '/discounts', label: 'Discounts', section: 'Discounts', icon: Tag },
  {
    href: '/discounts/offers',
    label: 'Offers',
    section: 'Discounts',
    icon: Tag,
    keywords: ['bundle', 'combo'],
  },
  {
    href: '/stores',
    label: 'Websites',
    section: 'Websites',
    icon: PanelsTopLeft,
    keywords: ['stores', 'pages', 'landing', 'online store', 'builder'],
  },
  {
    href: '/stores/new',
    label: 'Create a website',
    section: 'Websites',
    icon: Plus,
    keywords: ['new store', 'new landing page', 'template', 'design'],
  },
  {
    href: '/media',
    label: 'Images',
    section: 'Websites',
    icon: Images,
    keywords: ['media', 'photos', 'upload'],
  },
  {
    href: '/analytics',
    label: 'Analytics',
    section: 'Analytics',
    icon: ChartColumn,
    keywords: ['reports', 'sales'],
  },
  ...SETTINGS_GROUPS.flatMap((group) =>
    group.entries.map((entry) => ({
      href: entry.href,
      label: entry.title,
      section: 'Settings',
      icon: entry.icon,
      keywords: entry.keywords,
    }))
  ),
  {
    href: '/account/profile',
    label: 'Your account',
    section: 'Account',
    icon: UserRound,
    keywords: ['profile', 'name', 'password', 'security'],
  },
]

/** What the empty menu offers: the things people open the workspace to do. */
const SUGGESTED = ['/orders', '/products/new', '/labels', '/stores']

/**
 * The searches a typed query can be handed to. Each list page already reads
 * `?q=`, so a search from here lands on the same filtered list a merchant
 * would get by typing into that page's own box — a link they can send on.
 */
const SEARCHES = [
  { base: '/orders', label: 'orders', icon: ShoppingBag },
  { base: '/products', label: 'products', icon: Package },
  { base: '/customers', label: 'customers', icon: Users },
]

interface Result {
  key: string
  href: string
  label: string
  meta: string
  icon: LucideIcon
}

function resultsFor(query: string): Result[] {
  const q = query.trim().toLowerCase()

  if (!q) {
    return SUGGESTED.flatMap((href) => {
      const destination = DESTINATIONS.find((d) => d.href === href)
      return destination ? [toResult(destination)] : []
    })
  }

  const searches: Result[] = SEARCHES.map((search) => ({
    key: `search:${search.base}`,
    href: `${search.base}?${new URLSearchParams({ q: query.trim() })}`,
    label: `Search ${search.label} for “${query.trim()}”`,
    meta: 'Search',
    icon: search.icon,
  }))

  const matches = DESTINATIONS.filter((destination) =>
    [destination.label, destination.section, ...(destination.keywords ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(q)
  ).map(toResult)

  // A query that names a place goes there first; one that does not is
  // probably a customer's name or a phone number, and searching is the answer.
  return matches.length > 0 ? [...matches, ...searches] : searches
}

function toResult(destination: Destination): Result {
  return {
    key: destination.href,
    href: destination.href,
    label: destination.label,
    meta: destination.section,
    icon: destination.icon,
  }
}

const subscribe = () => () => {}
const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent)
const notApple = () => false

/**
 * Search, and a way to jump anywhere in the workspace.
 *
 * Opened from the rail or with Ctrl K / ⌘K. Typing filters the destinations
 * and offers to search orders, products and customers; the arrow keys move
 * and Enter goes. It is a combobox in the ARIA sense — focus stays in the
 * field while the highlighted row changes — so a screen reader hears each row
 * as it is reached without the field losing what has been typed.
 */
export function CommandMenu({ className }: { className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const listId = useId()
  // Which modifier to print. The server cannot know, so it renders Ctrl and
  // the client corrects it after hydration without a mismatch warning.
  const apple = useSyncExternalStore(subscribe, isApple, notApple)

  const results = resultsFor(query)
  const active = Math.min(highlighted, results.length - 1)

  // Cleared on the way out rather than the way in, so the shortcut below can
  // toggle the menu without reaching for anything but a state setter.
  function close() {
    setOpen(false)
    setQuery('')
    setHighlighted(0)
  }

  function go(result: Result) {
    close()
    router.push(result.href)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'border-sidebar-border bg-canvas text-muted-foreground hover:text-foreground flex h-10 w-full items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors',
          className
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="border-sidebar-border bg-card rounded-md border px-1.5 font-sans text-[0.6875rem] font-semibold">
          {apple ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <DialogContent
          showCloseButton={false}
          className="gap-0 p-0 sm:top-[18%] sm:max-w-lg sm:translate-y-0"
        >
          <DialogTitle className="sr-only">Search the workspace</DialogTitle>
          <div className="border-border flex items-center gap-3 border-b px-4">
            <Search className="text-muted-foreground size-4.5 shrink-0" />
            {/* The dialog moves focus to its first field when it opens. */}
            <input
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                results[active] ? `${listId}-${active}` : undefined
              }
              aria-autocomplete="list"
              aria-label="Search orders, products, customers or settings"
              placeholder="Search orders, products, customers or settings"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlighted(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setHighlighted((active + 1) % results.length)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setHighlighted((active - 1 + results.length) % results.length)
                } else if (event.key === 'Enter' && results[active]) {
                  event.preventDefault()
                  go(results[active])
                }
              }}
              className="placeholder:text-muted-foreground h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label={query ? 'Results' : 'Suggestions'}
            className="max-h-[min(24rem,60svh)] overflow-y-auto p-2"
          >
            {!query && (
              <li
                role="presentation"
                className="text-muted-foreground px-2.5 pt-1 pb-2 text-xs font-semibold"
              >
                Jump to
              </li>
            )}
            {results.map((result, index) => {
              const Icon = result.icon
              return (
                <li
                  key={result.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  // The field keeps focus; pointer users still pick a row by
                  // clicking it, and hovering moves the highlight with them.
                  onMouseMove={() => setHighlighted(index)}
                  onClick={() => go(result)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm',
                    index === active && 'bg-muted'
                  )}
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {result.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {result.meta}
                  </span>
                  {index === active && (
                    <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
