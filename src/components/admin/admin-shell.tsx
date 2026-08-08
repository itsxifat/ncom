'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

function SidebarBody() {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center gap-2 px-1">
        <span className="bg-primary flex size-6 items-center justify-center rounded-md text-xs font-bold text-white">
          N
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">
          NCOM Admin
        </span>
      </div>
      <AdminSidebarNav />
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground mt-auto text-sm font-medium"
      >
        ← Back to dashboard
      </Link>
    </div>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)

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
            NCOM Admin
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
          <SidebarBody />
        </SheetContent>
      </Sheet>

      <aside className="bg-sidebar text-sidebar-foreground hidden border-r px-4 py-6 md:flex">
        <SidebarBody />
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
