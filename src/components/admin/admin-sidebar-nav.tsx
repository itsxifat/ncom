'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  LayoutTemplate,
  Blocks,
  Image as ImageIcon,
  Globe,
  Globe2,
  Settings,
  Layers,
  Package,
  TicketPercent,
  CreditCard,
  Activity,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Grouped by what the rows actually are: the people and tenants on the
// platform, then what NCOM sells them, then the content they produce, then the
// platform's own knobs.
const NAV_GROUPS = [
  {
    label: 'Platform',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
    ],
  },
  {
    label: 'Monetization',
    items: [
      { href: '/admin/plans', label: 'Plans', icon: Layers },
      { href: '/admin/addons', label: 'Add-ons', icon: Package },
      { href: '/admin/coupons', label: 'Coupons', icon: TicketPercent },
      {
        href: '/admin/subscriptions',
        label: 'Subscriptions',
        icon: CreditCard,
      },
      { href: '/admin/usage', label: 'Usage', icon: Activity },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/stores', label: 'Stores', icon: FolderKanban },
      { href: '/admin/templates', label: 'Templates', icon: LayoutTemplate },
      { href: '/admin/components', label: 'Components', icon: Blocks },
      { href: '/admin/media', label: 'Media', icon: ImageIcon },
      { href: '/admin/published-pages', label: 'Published pages', icon: Globe },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { href: '/admin/domains', label: 'Domains', icon: Globe2 },
      { href: '/admin/email', label: 'Email', icon: Mail },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function AdminSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="eyebrow text-ink-muted mb-2 px-3.5">{group.label}</p>
          {group.items.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(`${item.href}/`))
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
