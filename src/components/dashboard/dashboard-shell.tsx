'use client'

import { House, Package, ScanLine, ShoppingBag } from 'lucide-react'
import { AppFrame } from '@/components/app/app-frame'
import type { TabItem } from '@/components/app/mobile-tab-bar'
import { BrandMark } from '@/components/app/brand-mark'
import { AccountMenu } from '@/components/dashboard/account-menu'
import { CommandMenu } from '@/components/dashboard/command-menu'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import {
  NavLink,
  SETTINGS_NAV_ITEM,
  SidebarNav,
} from '@/components/dashboard/sidebar-nav'

interface DashboardShellProps {
  organizationId: string
  organizations: { id: string; name: string }[]
  isPlatformAdmin: boolean
  userName: string | null | undefined
  userEmail: string | null | undefined
  initials: string | undefined
  /** Orders still waiting on a person — screened, held or not yet sent. */
  ordersNeedingAction: number
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
  { href: '/dashboard', label: 'Home', icon: House, exact: true },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
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
  ordersNeedingAction,
  signOutAction,
  children,
}: DashboardShellProps) {
  return (
    <AppFrame
      brand={<BrandMark tone="onLight" />}
      nav={<SidebarNav ordersNeedingAction={ordersNeedingAction} />}
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
          className="border-border bg-card h-10 max-w-44 rounded-lg border px-2"
        />
      }
      railHeader={
        <div className="flex flex-col gap-2">
          <OrgSwitcher
            activeOrgId={organizationId}
            organizations={organizations}
            className="border-sidebar-border bg-card hover:bg-sidebar-accent h-13 w-full rounded-lg border px-2"
          />
          <CommandMenu />
        </div>
      }
      railFooter={
        <>
          <NavLink item={SETTINGS_NAV_ITEM} />
          <div className="border-sidebar-border mt-1.5 border-t pt-1.5">
            <AccountMenu
              name={userName}
              email={userEmail}
              initials={initials}
              isPlatformAdmin={isPlatformAdmin}
              signOutAction={signOutAction}
            />
          </div>
        </>
      }
    >
      {children}
    </AppFrame>
  )
}
