'use client'

import { LogOut } from 'lucide-react'
import { AppFrame } from '@/components/app/app-frame'
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
      brandOnLight={<BrandMark tone="onLight" />}
      nav={<SidebarNav isPlatformAdmin={isPlatformAdmin} />}
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
