'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  FolderKanban,
  LayoutDashboard,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { AppFrame } from '@/components/app/app-frame'
import type { TabItem } from '@/components/app/mobile-tab-bar'
import { BrandMark } from '@/components/app/brand-mark'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'

/**
 * What a platform admin reaches for from a phone: the pulse, then the two
 * kinds of row they act on, then the tenants' content. Everything monetization
 * — plans, coupons, subscriptions — is deliberately absent, because none of it
 * is work anyone should be doing one-handed.
 */
const MOBILE_TABS: TabItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/organizations', label: 'Orgs', icon: Building2 },
  { href: '/admin/stores', label: 'Stores', icon: FolderKanban },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      brand={<BrandMark suffix="Admin" />}
      tabs={MOBILE_TABS}
      // The blast radius warning is a rail fixture on desktop. On a phone the
      // rail is a drawer nobody has open while they work, so the same warning
      // rides in the top bar, where it is in view for every destructive tap.
      mobileActions={
        <span className="bg-lime text-lime-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase">
          <ShieldAlert className="size-3.5" />
          All tenants
        </span>
      }
      railHeader={
        <div className="bg-lime text-lime-foreground flex items-start gap-2.5 rounded-2xl p-3">
          <ShieldAlert className="mt-px size-4 shrink-0" />
          <p className="text-xs leading-snug font-medium">
            You&apos;re in the platform admin. Actions here affect every tenant.
          </p>
        </div>
      }
      nav={<AdminSidebarNav />}
      railFooter={
        <Link
          href="/dashboard"
          className="text-ink-muted hover:bg-sidebar-accent hover:text-sidebar-foreground flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4.5 shrink-0" />
          Back to workspace
        </Link>
      }
    >
      {children}
    </AppFrame>
  )
}
