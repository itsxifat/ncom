'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChartColumn,
  House,
  Package,
  PanelsTopLeft,
  Settings,
  ShoppingBag,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /**
   * Every route this entry stands for. One entry covers a whole job — Orders
   * is also the label printer and the scanner — so it has to stay lit on all
   * of them, or the rail tells someone on /labels that they are nowhere.
   */
  owns: string[]
}

/**
 * The workspace's destinations.
 *
 * Seven, down from twenty-six. The old rail listed every screen the platform
 * has, grouped by how the code is organised, and a merchant opening it for the
 * first time met Webhooks and Locations at the same weight as Orders. Now each
 * entry is a job someone opens the workspace to do, the screens that make up a
 * job are tabs inside it (Products holds Categories, Collections and Stock),
 * and everything that is set up once lives in Settings at the foot of the rail.
 *
 * Selling comes first because it is what merchants open the dashboard to do;
 * the website comes after, because a page is built once and sold from daily.
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: House, owns: ['/dashboard'] },
  {
    href: '/orders',
    label: 'Orders',
    icon: ShoppingBag,
    // The packing bench, in the order a parcel meets it: the order, its
    // sticker, the scan on the way out.
    owns: ['/orders', '/labels', '/scan'],
  },
  {
    href: '/products',
    label: 'Products',
    icon: Package,
    owns: ['/products', '/categories', '/collections', '/inventory'],
  },
  { href: '/customers', label: 'Customers', icon: Users, owns: ['/customers'] },
  { href: '/discounts', label: 'Discounts', icon: Tag, owns: ['/discounts'] },
  {
    href: '/stores',
    label: 'Websites',
    icon: PanelsTopLeft,
    // "Stores" was the platform's word; what a merchant builds and edits here
    // is pages, and the images in them.
    owns: ['/stores', '/media'],
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: ChartColumn,
    owns: ['/analytics'],
  },
]

export const SETTINGS_NAV_ITEM: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
  // Team and billing kept their old URLs; they are settings now all the same.
  owns: ['/settings', '/organization', '/billing', '/tracking'],
}

function isActive(item: NavItem, pathname: string) {
  return item.owns.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

export function NavLink({
  item,
  count,
}: {
  item: NavItem
  /** Things waiting on the merchant here, shown as a number beside the label. */
  count?: number
}) {
  const pathname = usePathname()
  const active = isActive(item, pathname)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground font-medium'
      )}
    >
      <Icon className="size-4.5 shrink-0" />
      {item.label}
      {count ? (
        <span
          // The number is part of the link's name, so a screen reader hears
          // "Orders, 15 need you" rather than a bare "15" after it.
          aria-label={`${count} need you`}
          className="bg-ink text-ink-foreground ml-auto min-w-6 rounded-full px-2 text-center text-xs leading-5 font-semibold tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}

export function SidebarNav({
  ordersNeedingAction,
}: {
  ordersNeedingAction: number
}) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          count={item.href === '/orders' ? ordersNeedingAction : undefined}
        />
      ))}
    </nav>
  )
}
