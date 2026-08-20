'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  LayoutDashboard,
  Store,
  Settings,
  ShieldCheck,
  Users,
  Package,
  ShoppingCart,
  Layers,
  Warehouse,
  UserRound,
  Tag,
  Image as ImageIcon,
  CreditCard,
  FolderTree,
  KeyRound,
  Webhook,
  Truck,
  BarChart3,
  ScanLine,
  Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Workspace navigation.
 *
 * Grouped to match how the platform is actually shaped: commerce belongs to the
 * workspace (one catalogue, one inventory, one order book, shared by every
 * site), while a store is just a website — a subdomain, its pages and its
 * domain settings. Selling comes first because it is what merchants open the
 * dashboard to do; sites and setup sit below it.
 */
const NAV_GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  {
    label: null,
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Sell',
    items: [
      { href: '/orders', label: 'Orders', icon: ShoppingCart },
      // The packing bench, in the order a parcel meets it: print the sticker,
      // stick it on, scan it back when it goes out.
      { href: '/labels', label: 'Labels', icon: Printer },
      { href: '/scan', label: 'Scan', icon: ScanLine },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/tracking', label: 'Tracking', icon: Activity },
      { href: '/products', label: 'Products', icon: Package },
      { href: '/categories', label: 'Categories', icon: FolderTree },
      { href: '/collections', label: 'Collections', icon: Layers },
      { href: '/inventory', label: 'Inventory', icon: Warehouse },
      { href: '/customers', label: 'Customers', icon: UserRound },
      { href: '/discounts', label: 'Discounts', icon: Tag },
    ],
  },
  {
    label: 'Sites',
    items: [
      { href: '/stores', label: 'Stores', icon: Store },
      { href: '/media', label: 'Media', icon: ImageIcon },
    ],
  },
  {
    label: 'Developers',
    items: [
      { href: '/settings/api-keys', label: 'API keys', icon: KeyRound },
      { href: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/settings/payments', label: 'Payments', icon: Settings },
      { href: '/settings/courier', label: 'Courier & fraud', icon: Truck },
      { href: '/settings/shipping', label: 'Shipping', icon: Settings },
      { href: '/settings/taxes', label: 'Taxes', icon: Settings },
      { href: '/settings/locations', label: 'Locations', icon: Settings },
      { href: '/organization', label: 'Workspace', icon: Users },
      { href: '/billing', label: 'Plan & billing', icon: CreditCard },
      { href: '/account/profile', label: 'Account', icon: Settings },
    ],
  },
]

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
}

export function SidebarNav({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const pathname = usePathname()

  const groups = isPlatformAdmin
    ? [
        ...NAV_GROUPS,
        {
          label: 'Platform',
          items: [{ href: '/admin', label: 'Admin', icon: ShieldCheck }],
        },
      ]
    : NAV_GROUPS

  return (
    <nav className="flex flex-col gap-5">
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-1">
          {group.label && (
            <p className="text-ink-muted px-3.5 pb-1 text-[11px] font-semibold tracking-wider uppercase">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            // Exact match for the group roots, prefix match for detail pages,
            // so /orders/123 still highlights Orders without /settings/taxes
            // also lighting up /settings/shipping.
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-ink-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
