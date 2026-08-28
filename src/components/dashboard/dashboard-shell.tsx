'use client'

import {
  LayoutDashboard,
  LogOut,
  Package,
  ScanLine,
  ShoppingCart,
} from 'lucide-react'
import { AppFrame } from '@/components/app/app-frame'
import type { TabItem } from '@/components/app/mobile-tab-bar'
import { BrandMark } from '@/components/app/brand-mark'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import { SidebarNav } from '@/components/dashboard/sidebar-nav'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface DashboardShellProps {
  organizationId: string
  organizations: { id: string; name: string }[]
  isPlatformAdmin: boolean
  userName: string | null | undefined
  userEmail: string | null | undefined
  initials: string | undefined
  signOutAction: () => void | Promise<void>
  children: React.ReactNode
}

/**
 * The four the bottom bar is worth spending on, in the order a merchant's day
 * runs: what happened overnight, what has to ship, the parcel in your hand, and
 * the thing you are about to sell. Scan earns its slot on a phone specifically —
 * it is the one screen here that is *better* on a phone than on a desktop,
 * because the phone is the barcode scanner.
 */
const MOBILE_TABS: TabItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, exact: true },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/scan', label: 'Scan', icon: ScanLine },
  { href: '/products', label: 'Products', icon: Package },
]

export function DashboardShell({
  organizationId,
  organizations,
  isPlatformAdmin,
  userName,
  userEmail,
  initials,
  signOutAction,
  children,
}: DashboardShellProps) {
  return (
    <AppFrame
      brand={<BrandMark />}
      nav={<SidebarNav isPlatformAdmin={isPlatformAdmin} />}
      tabs={MOBILE_TABS}
      // Which workspace you are in is the one piece of context a merchant
      // cannot infer from the page, and it is the thing that makes an
      // accidental edit land in the wrong tenant — so it stays visible on a
      // phone rather than being folded into the drawer.
      mobileActions={
        <OrgSwitcher
          compact
          activeOrgId={organizationId}
          organizations={organizations}
          className="border-border bg-card h-10 max-w-[11rem] rounded-full border px-2.5"
        />
      }
      railFooter={
        <div className="bg-sidebar-accent flex items-center gap-2.5 rounded-2xl p-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-lime text-lime-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {userName ?? userEmail}
            </p>
            <p className="text-ink-muted truncate text-xs">{userEmail}</p>
          </div>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label="Sign out"
              className="text-ink-muted hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      }
      railHeader={
        <OrgSwitcher
          activeOrgId={organizationId}
          organizations={organizations}
          className="bg-sidebar-accent text-sidebar-foreground h-12 w-full rounded-2xl px-2.5 hover:bg-white/10 hover:text-white"
        />
      }
    >
      {children}
    </AppFrame>
  )
}
