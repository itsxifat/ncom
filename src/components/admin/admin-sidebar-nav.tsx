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
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/admin/components', label: 'Components', icon: Blocks },
  { href: '/admin/media', label: 'Media', icon: ImageIcon },
  { href: '/admin/published-pages', label: 'Published pages', icon: Globe },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/admin' && pathname.startsWith(`${item.href}/`))
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
