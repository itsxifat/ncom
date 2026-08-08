'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import { SidebarNav } from '@/components/dashboard/sidebar-nav'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

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

function SidebarBody({
  organizationId,
  organizations,
  isPlatformAdmin,
  userName,
  userEmail,
  initials,
  signOutAction,
}: Omit<DashboardShellProps, 'children'>) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center gap-2 px-1">
        <span className="bg-primary flex size-6 items-center justify-center rounded-md text-xs font-bold text-white">
          N
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">
          NCOM
        </span>
      </div>

      <OrgSwitcher activeOrgId={organizationId} organizations={organizations} />

      <SidebarNav isPlatformAdmin={isPlatformAdmin} />

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {userName ?? userEmail}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {userEmail}
            </p>
          </div>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  )
}

export function DashboardShell({
  children,
  ...sidebarProps
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)

  // Closes the drawer on navigation. Adjusting state during render (rather
  // than in an effect) is React's own recommended pattern for "reset state
  // when a prop changes" — it avoids an extra committed render with the
  // drawer still open.
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMobileOpen(false)
  }

  return (
    <div className="flex flex-1 flex-col md:grid md:grid-cols-[16rem_1fr]">
      <div className="border-border bg-background sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <span className="bg-primary flex size-6 items-center justify-center rounded-md text-xs font-bold text-white">
            N
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            NCOM
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-sidebar p-4">
          <SheetHeader className="sr-only p-0">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarBody {...sidebarProps} />
        </SheetContent>
      </Sheet>

      <aside className="bg-sidebar text-sidebar-foreground hidden border-r px-4 py-6 md:flex">
        <SidebarBody {...sidebarProps} />
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
